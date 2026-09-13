import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from "react-native-vision-camera";
import {
  recognizeText,
  useVisionScanText,
  getImageSize,
  detectDocumentCorners,
  correctPerspective,
} from "vision-ocr";
import type { DocumentCorners } from "vision-ocr";
import { useRunOnJS } from "react-native-worklets-core";
import { Text, Button, Card } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { photoResultToParagraph } from "./recognition";
import { stitch } from "./stitch";
import { CropBox, CropBoxHandle } from "./CornerAdjustOverlay";

/**
 * Capture-then-adjust scanner (docs/14, 2026-09-13), rendered INLINE inside
 * the Scan tab's own existing viewfinder box (docs/05) — never a full-
 * screen takeover. A real user test (2026-09-13) objected to the whole
 * Scan tab (header, profile, buttons) disappearing to scan a label, and
 * pointed out the tab already has a view window with a dashed-border guide
 * in it — that same guide should just become the crop tool, not launch a
 * separate screen. `useCameraCapture` below returns exactly two pieces of
 * UI — `boxContent` and `footer` — for the caller (Scan tab) to drop into
 * the same box/button slots it already uses for its idle state, so nothing
 * else on screen has to move or disappear.
 *
 * Triggered by a live-read-quality signal rather than a clock:
 * `react-native-vision-camera` doesn't expose the phone's actual hardware
 * focus-lock state to JS (checked directly, 2026-09-13 — no such API), so
 * this uses the live preview's own OCR (already running, previously just a
 * cosmetic cue) as a proxy — a blurry or badly-angled view yields little or
 * no recognizable text, while a sharp, well-aimed one reads a solid amount
 * of it — so once the live preview has read a substantial chunk of text for
 * a couple of consecutive frames in a row, the guide turns green and the
 * real photo is taken right then.
 *
 * The user CANNOT interact with anything mid-capture — they're holding the
 * product in one hand and the phone in the other, so dragging a crop guide
 * live is impossible. Instead: capture first, adjust second. After the
 * shutter fires, they can set the product down, and the SAME box that just
 * showed the live camera now shows the CAPTURED PHOTO with four draggable
 * corners — Vision's own rectangle detector suggests a starting position —
 * for them to box in exactly the ingredient panel at their own pace.
 *
 * That confirmed quad is then perspective-corrected (flattened into an
 * upright rectangle, the same technique document-scanner apps use) BEFORE
 * running OCR on it. This replaced an automatic-decision pipeline that grew
 * increasingly elaborate over several real-device failures on 2026-09-13
 * (spatial/textual completeness heuristics, then multi-shot reconciliation,
 * then several attempts at more robust reading-order sorting) without ever
 * fully fixing the root cause: a tilted photo makes Vision's axis-aligned
 * text boxes come back inflated/skewed, which no amount of downstream
 * guessing could reliably compensate for. Perspective correction fixes the
 * tilt at the source; manual cropping removes the Nutrition Facts grid and
 * second-language repeat from the image entirely, rather than needing
 * text-side logic to guess where the real ingredient list starts and ends.
 *
 * After each capture+adjust+correct cycle, the user is asked directly —
 * "Done" or "Add more" — rather than the app guessing whether the whole
 * label was captured. "Add more" repeats capture-then-adjust for a second,
 * different photo (e.g. the label wraps around a curved package) and joins
 * the two texts (stitch, stitch.ts) — an explicit choice is far more
 * reliable than any automatic completeness heuristic this session tried.
 *
 * The live frame processor is kept only for the readiness signal and the
 * cosmetic "Reading label…" cue; it never supplies the text that actually
 * gets scanned — every scan is built from a real, corrected photo.
 *
 * NOTE: requires a dev/EAS build (native modules). Cannot run in Expo Go or
 * the sandbox. See docs/14 "Definition of done".
 */

const READY_MIN_CHARS = 30; // total live-preview text length that counts as "reading clearly"
const READY_STREAK = 2; // consecutive good frames required (~3fps, so ~660ms sustained)
const READY_TIMEOUT_MS = 6000; // capture anyway if the view never reads strongly (bad angle/lighting)
const GREEN_FLASH_MS = 250; // let the user see the guide turn green just before the shutter fires

type Phase = "waiting" | "ready" | "capturing" | "reviewing" | "correcting" | "confirmDone";

interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
  corners: DocumentCorners;
}

/** A reasonable starting box (matching the live-preview guide's own
 * proportions) when Vision's rectangle detector doesn't find anything
 * confident, or takes too long — a curved or low-contrast package, say. */
function defaultCorners(width: number, height: number): DocumentCorners {
  const marginX = width * 0.09;
  const top = height * 0.28;
  const bottom = height * 0.72;
  return {
    topLeft: { x: marginX, y: top },
    topRight: { x: width - marginX, y: top },
    bottomLeft: { x: marginX, y: bottom },
    bottomRight: { x: width - marginX, y: bottom },
  };
}

export interface UseCameraCaptureOptions {
  /** Whether the scan flow is currently engaged — false means "show your
   * own idle content instead," not "unmount the camera hardware." */
  active: boolean;
  /** The viewfinder box's own measured size (onLayout) — needed to convert
   * between screen-drag coordinates and image-pixel coordinates for the
   * crop tool; the live camera feed itself just fills whatever it's given. */
  boxWidth: number;
  boxHeight: number;
  onCapture: (paragraph: string) => void;
  onCancel: () => void;
}

export interface CameraCaptureUI {
  /** What to render inside the existing viewfinder box — null while
   * inactive, so the caller shows its own idle placeholder instead. */
  boxContent: React.ReactNode;
  /** What to render in place of the idle action buttons — null while
   * inactive. */
  footer: React.ReactNode;
}

export function useCameraCapture({
  active,
  boxWidth,
  boxHeight,
  onCapture,
  onCancel,
}: UseCameraCaptureOptions): CameraCaptureUI {
  const t = useTheme();
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const visionScanText = useVisionScanText();
  const cameraRef = useRef<Camera>(null);
  const cropBoxRef = useRef<CropBoxHandle>(null);

  const [phase, setPhase] = useState<Phase>("waiting");
  const [sawText, setSawText] = useState(false);
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);
  const [previewText, setPreviewText] = useState("");
  const sawTextRef = useRef(false);
  const readyRef = useRef(false);
  const streakRef = useRef(0);
  const finishedRef = useRef(false);
  const accumulatedRef = useRef("");

  const resetReadiness = useCallback(() => {
    readyRef.current = false;
    streakRef.current = 0;
    sawTextRef.current = false;
    setSawText(false);
  }, []);

  // Starting a fresh scan (including re-engaging after a previous one
  // finished) always begins from a clean slate.
  useEffect(() => {
    if (!active) return;
    finishedRef.current = false;
    accumulatedRef.current = "";
    setCaptured(null);
    setPreviewText("");
    resetReadiness();
    setPhase("waiting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (active && !hasPermission) requestPermission();
  }, [active, hasPermission, requestPermission]);

  // Live-read-quality signal: a strong, sustained read (READY_STREAK
  // consecutive frames over READY_MIN_CHARS) is our proxy for "the camera
  // can currently read this clearly" — there's no hardware focus-lock event
  // exposed to JS to wait for instead (see file header). Also drives the
  // cosmetic "Reading label…"/green cues. Not used for the text that's
  // actually scanned — that always comes from a real, corrected photo.
  const onFrameResult = useRunOnJS(
    (result: { text: string }) => {
      if (finishedRef.current) return;
      const totalChars = result.text.length;
      if (totalChars > 0) {
        sawTextRef.current = true;
        setSawText(true);
      }
      if (totalChars >= READY_MIN_CHARS) {
        streakRef.current += 1;
        if (streakRef.current >= READY_STREAK) readyRef.current = true;
      } else {
        streakRef.current = 0;
      }
    },
    []
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      runAtTargetFps(3, () => {
        "worklet";
        const result = visionScanText(frame);
        onFrameResult(result);
      });
    },
    [visionScanText, onFrameResult]
  );

  // Take one real photo and get a starting crop suggestion for it. A
  // failed shot (camera busy, a hiccup mid-capture) just returns to
  // waiting — the readiness loop below will retry.
  const captureAndReview = useCallback(async () => {
    try {
      const camera = cameraRef.current;
      if (!camera) {
        setPhase("waiting");
        return;
      }
      const photo = await camera.takePhoto({ flash: "off", enableShutterSound: false });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      // Authoritative dimensions first (fast, always reliable) — the corner
      // SUGGESTION below is best-effort and time-boxed on the JS side
      // (vision-ocr/index.ts), so a slow/failed detection can never block
      // getting the dimensions this screen needs to lay itself out.
      const { width, height } = await getImageSize(uri);
      const suggested = await detectDocumentCorners(uri);
      const corners = suggested ?? defaultCorners(width, height);
      setCaptured({ uri, width, height, corners });
      setPhase("reviewing");
    } catch {
      setPhase("waiting");
    }
  }, []);

  // Waits for a strong, sustained live read (the "in focus and readable"
  // proxy), then a brief green flash, then takes the photo — every time
  // `phase` becomes "waiting" while active, including the very first
  // engagement and every "Add more"/"Retake" cycle.
  useEffect(() => {
    if (!active || !hasPermission || !device || phase !== "waiting") return;

    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const waitForReadyRead = async () => {
      const start = Date.now();
      while (!readyRef.current && Date.now() - start < READY_TIMEOUT_MS) {
        await sleep(100);
      }
    };

    (async () => {
      await waitForReadyRead();
      if (cancelled) return;
      setPhase("ready");
      await sleep(GREEN_FLASH_MS);
      if (cancelled) return;
      setPhase("capturing");
      await captureAndReview();
    })();

    return () => {
      cancelled = true;
    };
  }, [active, hasPermission, device, phase, captureAndReview]);

  const handleConfirmCorners = useCallback(async () => {
    const photo = captured;
    if (!photo) return;
    const corners = cropBoxRef.current?.getCorners() ?? photo.corners;
    setPhase("correcting");
    try {
      const correctedUri = await correctPerspective(photo.uri, corners);
      const result = await recognizeText(correctedUri);
      if (__DEV__) {
        // Diagnostic only (docs/06/14): confirms the perspective-corrected
        // image's blocks read as plausible, non-tilted lines. Grep Metro
        // for "BLOCKS".
        // eslint-disable-next-line no-console
        console.log(
          `\n▓▓▓ CORRECTED PHOTO BLOCKS (${result.blocks.length}) ▓▓▓\n` +
            result.blocks
              .map(
                (b, i) =>
                  `[${i}] y=${Math.round(b.y)} h=${Math.round(b.height)} x=${Math.round(b.x)} w=${Math.round(
                    b.width
                  )} :: ${JSON.stringify(
                    b.text.length > 100 ? `${b.text.slice(0, 100)}… (+${b.text.length - 100})` : b.text
                  )}`
              )
              .join("\n")
        );
      }
      accumulatedRef.current = stitch(accumulatedRef.current, photoResultToParagraph(result));
    } catch {
      // Leave accumulatedRef as-is — the user can still choose Done/Add more
      // with whatever was captured so far, or Retake this one.
    }
    setPreviewText(accumulatedRef.current);
    setCaptured(null);
    setPhase("confirmDone");
  }, [captured]);

  const handleRetake = useCallback(() => {
    setCaptured(null);
    resetReadiness();
    setPhase("waiting");
  }, [resetReadiness]);

  const handleAddMore = useCallback(() => {
    resetReadiness();
    setPhase("waiting");
  }, [resetReadiness]);

  const handleDone = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCapture(accumulatedRef.current);
  }, [onCapture]);

  return useMemo<CameraCaptureUI>(() => {
    if (!active) return { boxContent: null, footer: null };

    if (!device) {
      return {
        boxContent: (
          <View style={styles.center}>
            <Text tone="muted">No camera device available.</Text>
          </View>
        ),
        footer: <Button title="Back" kind="secondary" onPress={onCancel} />,
      };
    }

    if (!hasPermission) {
      return {
        boxContent: (
          <View style={[styles.center, { gap: t.spacing.md, padding: t.spacing.md }]}>
            <Text style={{ textAlign: "center" }}>Camera access is needed to read labels on-device.</Text>
          </View>
        ),
        footer: (
          <View style={{ gap: t.spacing.sm }}>
            <Button title="Grant camera access" onPress={requestPermission} />
            <Button title="Back" kind="secondary" onPress={onCancel} />
          </View>
        ),
      };
    }

    if (phase === "reviewing" && captured && boxWidth > 0 && boxHeight > 0) {
      return {
        boxContent: (
          <CropBox
            ref={cropBoxRef}
            containerWidth={boxWidth}
            containerHeight={boxHeight}
            photoUri={captured.uri}
            photoWidth={captured.width}
            photoHeight={captured.height}
            initialCorners={captured.corners}
            color={t.colors.cyan}
          />
        ),
        footer: (
          <View style={{ gap: t.spacing.sm }}>
            <Button title="Use this photo" onPress={handleConfirmCorners} />
            <Button title="Retake" kind="secondary" onPress={handleRetake} />
          </View>
        ),
      };
    }

    if (phase === "correcting") {
      return {
        boxContent: (
          <View style={styles.center}>
            <Text tone="cyan" bold>
              Straightening and reading the label…
            </Text>
          </View>
        ),
        footer: null,
      };
    }

    if (phase === "confirmDone") {
      return {
        boxContent: (
          <ScrollView style={{ flex: 1, width: "100%" }} contentContainerStyle={{ padding: t.spacing.md }}>
            <Text bold style={{ marginBottom: t.spacing.sm }}>
              Got it — anything else to add?
            </Text>
            <Card>
              <Text>{previewText || "(nothing read yet)"}</Text>
            </Card>
          </ScrollView>
        ),
        footer: (
          <View style={{ gap: t.spacing.sm }}>
            <Button title="Done" onPress={handleDone} />
            <Button
              title="Add more (list continues elsewhere on the package)"
              kind="secondary"
              onPress={handleAddMore}
            />
            <Button title="Cancel" kind="secondary" onPress={onCancel} />
          </View>
        ),
      };
    }

    // waiting / ready / capturing — the live camera feed + aim guide.
    const { message, tone, borderColor } =
      phase === "ready" || phase === "capturing"
        ? { message: "Clear view — capturing…", tone: "success" as const, borderColor: t.colors.success }
        : sawText
        ? { message: "Reading label…", tone: "cyan" as const, borderColor: t.colors.cyan }
        : {
            message: "Point at the ingredient list",
            tone: "muted" as const,
            borderColor: t.colors.cyan,
          };

    return {
      boxContent: (
        <View style={styles.fill}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={active}
            frameProcessor={frameProcessor}
            photo={true}
            pixelFormat="yuv"
          />
          <View style={styles.guideWrap} pointerEvents="none">
            <View style={[styles.guide, { borderColor }]} />
          </View>
          <View style={styles.messagePillWrap} pointerEvents="none">
            <View style={[styles.pill, { backgroundColor: t.colors.card }]}>
              <Text tone={tone} bold style={{ textAlign: "center" }} variant="caption">
                {message}
              </Text>
            </View>
          </View>
        </View>
      ),
      footer: <Button title="Cancel" kind="secondary" onPress={onCancel} />,
    };
  }, [
    active,
    device,
    hasPermission,
    requestPermission,
    phase,
    captured,
    boxWidth,
    boxHeight,
    previewText,
    sawText,
    frameProcessor,
    handleConfirmCorners,
    handleRetake,
    handleAddMore,
    handleDone,
    onCancel,
    t,
  ]);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  guideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  guide: {
    width: "82%",
    height: "70%",
    borderWidth: 2,
    borderRadius: 16,
    borderStyle: "dashed",
  },
  messagePillWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: "center",
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    maxWidth: "90%",
  },
});

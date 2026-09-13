import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { recognizeText, getImageSize, detectDocumentCorners, correctPerspective } from "vision-ocr";
import type { DocumentCorners } from "vision-ocr";
import { Text, Button, Card } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { photoResultToParagraph } from "./recognition";
import { stitch } from "./stitch";
import { CropBox, CropBoxHandle } from "./CornerAdjustOverlay";

/**
 * Manual-shutter, capture-then-adjust scanner (docs/14, 2026-09-13),
 * rendered INLINE inside the Scan tab's own existing viewfinder box
 * (docs/05) — never a full-screen takeover. `useCameraCapture` returns
 * exactly two pieces of UI — `boxContent` and `footer` — for the caller to
 * drop into the same box/button slots its idle state uses.
 *
 * Capture is a plain tap of a shutter button — deliberately NOT triggered
 * automatically off a live frame-processor readiness signal, which was the
 * single most repeated point of failure across a long run of real-device
 * fixes on 2026-09-13 and was never actually asked for.
 *
 * After the shutter fires, the SAME box that showed the live camera now
 * shows the CAPTURED PHOTO with four corner handles (a plain resizable
 * rectangle — drag one corner, the opposite corner stays anchored) for the
 * user to box in exactly the ingredient panel, excluding the Nutrition
 * Facts grid and second-language repeat from the image entirely.
 *
 * Once confirmed, that one photo is perspective-corrected and OCR'd —
 * exactly one read, no multi-shot voting. An earlier version silently took
 * two more photos of the same confirmed crop afterward and reconciled all
 * three (word-level majority vote) to cancel out letter-level OCR noise.
 * That was removed (2026-09-13, real device regression): those extra shots
 * fired AFTER the human pause of reviewing/confirming the crop, and by then
 * the phone had moved enough that the same pixel rectangle no longer
 * excluded the French text/Nutrition Facts it was drawn to exclude on the
 * first photo — so the "vote" could pick a wrong read from a misaligned
 * frame. Single-shot is simpler and doesn't have that failure mode.
 *
 * After each capture+adjust+correct cycle, the user is asked directly —
 * "Done" or "Add more" — rather than the app guessing whether the whole
 * label was captured. "Add more" repeats the whole cycle for a second,
 * different photo (e.g. the label wraps around a curved package) and joins
 * the two texts (stitch, stitch.ts).
 *
 * NOTE: requires a dev/EAS build (native camera + vision-ocr modules).
 * Cannot run in Expo Go or the sandbox. See docs/14 "Definition of done".
 */

type Phase = "waiting" | "capturing" | "reviewing" | "correcting" | "confirmDone";

interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
  corners: DocumentCorners;
}

/** A reasonable starting box (roughly centered, matching the old live-
 * preview guide's proportions) when Vision's rectangle detector doesn't
 * find anything confident, or takes too long — a curved or low-contrast
 * package, say. */
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
  const cameraRef = useRef<Camera>(null);
  const cropBoxRef = useRef<CropBoxHandle>(null);

  const [phase, setPhase] = useState<Phase>("waiting");
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const accumulatedRef = useRef("");

  // Starting a fresh scan (including re-engaging after a previous one
  // finished) always begins from a clean slate.
  useEffect(() => {
    if (!active) return;
    finishedRef.current = false;
    accumulatedRef.current = "";
    setCaptured(null);
    setPreviewText("");
    setError(null);
    setPhase("waiting");
  }, [active]);

  useEffect(() => {
    if (active && !hasPermission) requestPermission();
  }, [active, hasPermission, requestPermission]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    setError(null);
    setPhase("capturing");
    try {
      const photo = await camera.takePhoto({ flash: "off" });
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
      setError("Couldn't read that photo. Try again.");
      setPhase("waiting");
    }
  }, []);

  const handleConfirmCorners = useCallback(async () => {
    const photo = captured;
    if (!photo) return;
    const corners = cropBoxRef.current?.getCorners() ?? photo.corners;
    setCaptured(null);
    setPhase("correcting");

    let text = "";
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
      text = photoResultToParagraph(result);
    } catch {
      text = "";
    }

    accumulatedRef.current = stitch(accumulatedRef.current, text);
    setPreviewText(accumulatedRef.current);
    setPhase("confirmDone");
  }, [captured]);

  const handleRetake = useCallback(() => {
    setCaptured(null);
    setPhase("waiting");
  }, []);

  const handleAddMore = useCallback(() => {
    setPhase("waiting");
  }, []);

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

    // The camera stays mounted for the whole active session (not just
    // "waiting"/"capturing") so switching phases (review, correcting,
    // confirmDone, retake) never pays the cost of tearing down and
    // reinitializing the hardware. Phase-specific content is layered OVER
    // it, opaque, so nothing but the live feed itself is actually hidden.
    const cameraLayer = (
      <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive={active} photo={true} />
    );

    let overlay: React.ReactNode = null;
    let footer: React.ReactNode;

    if (phase === "reviewing" && captured && boxWidth > 0 && boxHeight > 0) {
      overlay = (
        <View style={[styles.overlayOpaque, { backgroundColor: t.colors.canvas }]}>
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
        </View>
      );
      footer = (
        <View style={{ gap: t.spacing.sm }}>
          <Button title="Use this photo" onPress={handleConfirmCorners} />
          <Button title="Retake" kind="secondary" onPress={handleRetake} />
        </View>
      );
    } else if (phase === "correcting") {
      overlay = (
        <View style={[styles.center, styles.overlayOpaque, { backgroundColor: t.colors.canvas }]}>
          <Text tone="cyan" bold>
            Reading the label…
          </Text>
        </View>
      );
      footer = null;
    } else if (phase === "confirmDone") {
      overlay = (
        <View style={[styles.overlayOpaque, { backgroundColor: t.colors.canvas }]}>
          <ScrollView style={{ flex: 1, width: "100%" }} contentContainerStyle={{ padding: t.spacing.md }}>
            <Text bold style={{ marginBottom: t.spacing.sm }}>
              Got it — anything else to add?
            </Text>
            <Card>
              <Text>{previewText || "(nothing read yet)"}</Text>
            </Card>
          </ScrollView>
        </View>
      );
      footer = (
        <View style={{ gap: t.spacing.sm }}>
          <Button title="Done" onPress={handleDone} />
          <Button
            title="Add more (list continues elsewhere on the package)"
            kind="secondary"
            onPress={handleAddMore}
          />
          <Button title="Cancel" kind="secondary" onPress={onCancel} />
        </View>
      );
    } else {
      // waiting / capturing — live camera feed + aim guide + shutter button.
      overlay = (
        <>
          <View style={styles.guideWrap} pointerEvents="none">
            <View style={styles.guide} />
          </View>
          {error && (
            <View style={styles.messagePillWrap} pointerEvents="none">
              <View style={[styles.pill, { backgroundColor: t.colors.card }]}>
                <Text tone="red" bold style={{ textAlign: "center" }} variant="caption">
                  {error}
                </Text>
              </View>
            </View>
          )}
        </>
      );
      footer = (
        <View style={{ gap: t.spacing.sm }}>
          <Button
            title={phase === "capturing" ? "Reading…" : "📸  Capture"}
            onPress={handleCapture}
            disabled={phase === "capturing"}
          />
          <Button title="Cancel" kind="secondary" onPress={onCancel} />
        </View>
      );
    }

    return {
      boxContent: (
        <View style={styles.fill}>
          {cameraLayer}
          {overlay}
        </View>
      ),
      footer,
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
    error,
    handleCapture,
    handleConfirmCorners,
    handleRetake,
    handleAddMore,
    handleDone,
    onCancel,
    t,
  ]);
}

const styles = StyleSheet.create({
  // width: "100%" matters here: the parent box (Scan tab) centers its
  // children rather than stretching them, and a view whose only children
  // are absolutely positioned (the camera feed, the guide overlay) has no
  // intrinsic width of its own to report — without an explicit width it
  // collapses to a sliver (a real device miss, 2026-09-13: rendered as a
  // single vertical dashed line instead of a camera preview).
  fill: { flex: 1, width: "100%" },
  center: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  // Opaque layers stacked over the (still-running) camera feed for phases
  // that shouldn't show it — the hardware stays mounted underneath so
  // takePhoto() keeps working without remounting the Camera component.
  overlayOpaque: { ...StyleSheet.absoluteFillObject },
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
    borderColor: "rgba(255,255,255,0.7)",
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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from "react-native-vision-camera";
import { useTextRecognition, PhotoRecognizer } from "react-native-vision-camera-text-recognition";
import { useRunOnJS } from "react-native-worklets-core";
import { Text, Button } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { looksSpatiallyComplete } from "./completeness";
import { combineBurst, BurstShot } from "./burst";
import { toRecognizedBlocks, toSpatialBlocks, photoResultToParagraph, MLKitText } from "./recognition";

/**
 * Adaptive 1-or-2-photo scanner (docs/06 Step 1 / docs/14), triggered by a
 * live-read-quality signal rather than a clock.
 *
 * `react-native-vision-camera` doesn't expose the phone's actual hardware
 * focus-lock state to JS (checked directly, 2026-09-13 — no such API), so
 * there's no true "the lens just achieved focus" event to wait for. Instead,
 * this uses the live preview's own OCR (already running, previously just a
 * cosmetic cue) as a proxy: a blurry or badly-angled view yields little or
 * no recognizable text, while a sharp, well-aimed one reads a solid amount
 * of it — so once the live preview has read a substantial chunk of text for
 * a couple of consecutive frames in a row (READY_STREAK), the guide turns
 * green and the real photo is taken right then, instead of on a blind timer
 * that might fire on a still-settling or moving frame.
 *
 * The real, full-resolution photo is then OCR'd and checked — automatically,
 * using the label's own printed whitespace/border layout
 * (looksSpatiallyComplete, completeness.ts) — for whether it alone shows a
 * complete ingredients panel. Most packaging is flat or only mildly curved
 * and fits in one photo: that's the common case, and it's both faster (one
 * shutter sound, not three) and more accurate than firing on a fixed
 * schedule regardless of readiness.
 *
 * Only when that check says the panel isn't fully captured — a long or
 * curved label that plainly continues past the frame — does the app ask
 * the user to rotate the package, wait for a fresh strong read of the new
 * view, and take a second photo, merging the two (combineBurst, burst.ts).
 * The decision to ask is automatic and structural, not a guess, so "please
 * rotate" only ever shows up when something genuinely wasn't captured.
 *
 * Replaces an earlier design that waited for ANY text then a blind settle
 * delay before capturing, and before that, one that always took a fixed
 * burst of 3 photos on a timer, and before THAT, one that ran OCR
 * continuously on the live preview and stitched together small text blocks
 * recognized across ~9 lower-resolution frames — which had a real bug
 * (found 2026-09-13 from a real device scan): blocks from different, only
 * slightly time-shifted frames got concatenated in temporal (arrival) order
 * with no cross-frame spatial alignment, so a hand's natural micro-drift
 * during the hold could scramble text together in the wrong order. The live
 * frame processor below is kept for this readiness signal and the cosmetic
 * "Reading label…" cue; it never supplies the text that actually gets
 * scanned — every scan is built from real still photos.
 *
 * NOTE: requires a dev/EAS build (native modules). Cannot run in Expo Go or
 * the sandbox. See docs/14 "Definition of done".
 */

const READY_MIN_CHARS = 30; // total live-preview text length that counts as "reading clearly"
const READY_STREAK = 2; // consecutive good frames required (~3fps, so ~660ms sustained)
const READY_TIMEOUT_MS = 6000; // capture anyway if the view never reads strongly (bad angle/lighting)
const GREEN_FLASH_MS = 250; // let the user see the guide turn green just before the shutter fires
const ROTATE_PROMPT_MS = 1800; // minimum time given to start physically rotating the package

type Phase = "waiting" | "ready" | "analyzing" | "needMore" | "done";

export interface CameraScannerProps {
  onCapture: (paragraph: string) => void;
  onCancel: () => void;
}

export function CameraScanner({ onCapture, onCancel }: CameraScannerProps) {
  const t = useTheme();
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const { scanText } = useTextRecognition({ language: "latin" });
  const cameraRef = useRef<Camera>(null);

  const [phase, setPhase] = useState<Phase>("waiting");
  const [sawText, setSawText] = useState(false);
  const sawTextRef = useRef(false);
  const readyRef = useRef(false);
  const streakRef = useRef(0);
  const finishedRef = useRef(false);
  const sequenceStartedRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Live-read-quality signal: a strong, sustained read (READY_STREAK
  // consecutive frames over READY_MIN_CHARS) is our proxy for "the camera
  // can currently read this clearly" — there's no hardware focus-lock event
  // exposed to JS to wait for instead (see file header). Also drives the
  // cosmetic "Reading label…"/green cues. Not used for the text that's
  // actually scanned — that always comes from a real photo (takeShot).
  const onFrameResult = useRunOnJS(
    (result: MLKitText[]) => {
      if (finishedRef.current) return;
      const blocks = toRecognizedBlocks(result);
      const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
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
        const result = scanText(frame) as unknown as MLKitText[];
        onFrameResult(result);
      });
    },
    [scanText, onFrameResult]
  );

  // Take one real photo and OCR it. A failed shot (camera busy, a hiccup
  // mid-capture) shouldn't crash the sequence — return an empty shot;
  // combineBurst and the downstream "couldn't read a label" gate handle it.
  const takeShot = useCallback(async (): Promise<BurstShot> => {
    try {
      const camera = cameraRef.current;
      if (!camera) return { text: "", blocks: [] };
      const photo = await camera.takePhoto({ flash: "off", enableShutterSound: false });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      const result = await PhotoRecognizer({ uri, orientation: "portrait" });
      const blocks = toSpatialBlocks(result as any);
      if (__DEV__) {
        // Diagnostic only (docs/06): confirms the landscape->portrait
        // coordinate remap in toSpatialBlocks is actually correcting things
        // — after the fix, y should ascend in real top-to-bottom label
        // order and height should read as plausible single-line thickness,
        // not the wildly inflated values seen before the remap. Positions
        // are already corrected here (recognition.ts), not raw. Grep Metro
        // for "BLOCKS".
        // eslint-disable-next-line no-console
        console.log(
          `\n▓▓▓ PHOTO BLOCKS (${blocks.length}) ▓▓▓\n` +
            blocks
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
      return { text: photoResultToParagraph(result as any), blocks };
    } catch {
      return { text: "", blocks: [] };
    }
  }, []);

  const finish = useCallback(
    (shots: BurstShot[]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setPhase("done");
      onCapture(combineBurst(shots));
    },
    [onCapture]
  );

  // The whole capture sequence: wait for a strong, sustained live read (the
  // "in focus and readable" proxy), take one photo, and only ask for a
  // second if the first didn't show a complete panel (looksSpatiallyComplete
  // — the label's own printed whitespace/border, not a guess).
  useEffect(() => {
    if (!hasPermission || !device || sequenceStartedRef.current) return;
    sequenceStartedRef.current = true;

    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    // Waits for a strong sustained read, or gives up after READY_TIMEOUT_MS
    // so a bad angle/lighting can't hang the scan forever.
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

      setPhase("analyzing");
      const shot1 = await takeShot();
      if (cancelled) return;

      if (looksSpatiallyComplete(shot1.blocks)) {
        finish([shot1]);
        return;
      }

      // Ask for a second photo — reset the readiness signal so we wait for
      // a FRESH strong read of the new (rotated) view, not the stale one
      // from the original framing.
      setPhase("needMore");
      readyRef.current = false;
      streakRef.current = 0;
      sawTextRef.current = false;
      setSawText(false);
      await sleep(ROTATE_PROMPT_MS);
      if (cancelled) return;

      await waitForReadyRead();
      if (cancelled) return;
      setPhase("ready");
      await sleep(GREEN_FLASH_MS);
      if (cancelled) return;

      setPhase("analyzing");
      const shot2 = await takeShot();
      if (cancelled) return;
      finish([shot1, shot2]);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasPermission, device, takeShot, finish]);

  if (!device) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: t.colors.canvas }]}>
        <Text tone="muted">No camera device available.</Text>
        <Button title="Back" kind="secondary" onPress={onCancel} />
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: t.colors.canvas, gap: t.spacing.md }]}>
        <Text style={{ textAlign: "center" }}>
          Camera access is needed to read labels on-device.
        </Text>
        <Button title="Grant camera access" onPress={requestPermission} />
        <Button title="Back" kind="secondary" onPress={onCancel} />
      </View>
    );
  }

  const { message, tone, borderColor } =
    phase === "needMore"
      ? {
          message: "Didn't catch the whole list — slowly rotate the package so we can see the rest",
          tone: "warning" as const,
          borderColor: t.colors.warning,
        }
      : phase === "ready" || phase === "analyzing"
      ? { message: "Clear view — capturing…", tone: "success" as const, borderColor: t.colors.success }
      : sawText
      ? { message: "Reading label…", tone: "cyan" as const, borderColor: t.colors.cyan }
      : {
          message: "Point at the ingredient list",
          tone: "muted" as const,
          borderColor: "rgba(255,255,255,0.6)",
        };

  return (
    <View style={styles.fill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={phase !== "done"}
        frameProcessor={frameProcessor}
        photo={true}
        pixelFormat="yuv"
      />

      {/* Centre framing guide — aim the ingredient list inside it. Green
          means the live view is reading clearly and a photo is about to be
          taken; amber + the rotate message only appears when the
          completeness check below finds the panel genuinely isn't fully in
          frame. */}
      <View style={styles.guideWrap} pointerEvents="none">
        <View style={[styles.guide, { borderColor }]} />
        <View style={[styles.pill, { backgroundColor: t.colors.card, maxWidth: 300 }]}>
          <Text tone={tone} bold style={{ textAlign: "center" }}>
            {message}
          </Text>
        </View>
      </View>

      <View style={styles.hud} pointerEvents="box-none">
        <Button title="Cancel" kind="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  guideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  guide: {
    width: "82%",
    height: "44%",
    borderWidth: 2,
    borderRadius: 16,
    borderStyle: "dashed",
  },
  hud: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});

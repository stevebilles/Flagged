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
 * Adaptive 1-or-2-photo scanner (docs/06 Step 1 / docs/14).
 *
 * Takes ONE real, full-resolution photo once the live preview has seen the
 * label and the camera's had a brief moment to settle focus/exposure, OCRs
 * it, then checks — automatically, using the label's own printed
 * whitespace/border layout (looksSpatiallyComplete, completeness.ts) —
 * whether that one photo alone shows a complete ingredients panel. Most
 * packaging is flat or only mildly curved and fits in one photo: that's the
 * common case, and a single well-settled shot is both faster (one shutter
 * sound, not three) and more accurate than firing shots on a fixed schedule
 * regardless of whether the camera was ready.
 *
 * Only when that check says the panel isn't fully captured — a long or
 * curved label that plainly continues past the frame — does the app ask
 * the user to rotate the package and take a second photo, merging the two
 * (combineBurst, burst.ts). The decision to ask is automatic and structural
 * (the same whitespace/border signal, not a guess), so "please rotate" only
 * ever shows up when something genuinely wasn't captured — never routinely.
 *
 * Replaces an earlier design that always took a fixed burst of 3 photos on
 * a timer, and before that, one that ran OCR continuously on the live
 * preview and stitched together small text blocks recognized across ~9
 * lower-resolution frames — which had a real bug (found 2026-09-13 from a
 * real device scan): blocks from different, only slightly time-shifted
 * frames got concatenated in temporal (arrival) order with no cross-frame
 * spatial alignment, so a hand's natural micro-drift during the hold could
 * scramble English/French/nutrition-panel text together in the wrong order.
 * The live frame processor below is kept ONLY for the cosmetic "Reading
 * label…" cue and to know when the label has come into view; it no longer
 * supplies the text that actually gets scanned — every scan is built from
 * real still photos.
 *
 * NOTE: requires a dev/EAS build (native modules). Cannot run in Expo Go or
 * the sandbox. See docs/14 "Definition of done".
 */

const SAW_TEXT_TIMEOUT_MS = 4000; // don't wait forever if the live preview never sees text
const SETTLE_MS = 700; // let focus/exposure lock briefly before the real photo
const ROTATE_PROMPT_MS = 2200; // time given to physically rotate the package

type Phase = "waiting" | "analyzing" | "needMore" | "done";

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
  const finishedRef = useRef(false);
  const sequenceStartedRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Cosmetic + timing signal: turns the guide cyan + "Reading label…" once
  // the live preview sees any text, and tells the capture sequence below
  // the label has actually come into view. Not used for the text that's
  // actually scanned — that always comes from a real photo (takeShot).
  const onFrameResult = useRunOnJS(
    (result: MLKitText[]) => {
      if (finishedRef.current) return;
      if (toRecognizedBlocks(result).length > 0) {
        sawTextRef.current = true;
        setSawText(true);
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
      return {
        text: photoResultToParagraph(result as any),
        blocks: toSpatialBlocks(result as any),
      };
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

  // The whole capture sequence: wait for a steady view of the label, take
  // one photo, and only ask for a second if the first didn't show a
  // complete panel (looksSpatiallyComplete — the label's own printed
  // whitespace/border, not a guess).
  useEffect(() => {
    if (!hasPermission || !device || sequenceStartedRef.current) return;
    sequenceStartedRef.current = true;

    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    (async () => {
      const start = Date.now();
      while (!sawTextRef.current && Date.now() - start < SAW_TEXT_TIMEOUT_MS) {
        await sleep(100);
      }
      if (cancelled) return;
      await sleep(SETTLE_MS);
      if (cancelled) return;

      setPhase("analyzing");
      const shot1 = await takeShot();
      if (cancelled) return;

      if (looksSpatiallyComplete(shot1.blocks)) {
        finish([shot1]);
        return;
      }

      setPhase("needMore");
      await sleep(ROTATE_PROMPT_MS);
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
      : phase === "analyzing"
      ? { message: "Reading label…", tone: "cyan" as const, borderColor: t.colors.cyan }
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

      {/* Centre framing guide — aim the ingredient list inside it. Amber +
          the rotate message only appears when the completeness check below
          finds the panel genuinely isn't fully in frame. */}
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

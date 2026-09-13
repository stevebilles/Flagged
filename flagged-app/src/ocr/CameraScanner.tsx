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
import { combineBurst, BurstShot } from "./burst";
import { toRecognizedBlocks, toSpatialBlocks, photoResultToParagraph, MLKitText } from "./recognition";

/**
 * Burst-photo scanner (docs/06 Step 1 / docs/14). The user points and holds
 * steady; the app takes SHOT_COUNT real, full-resolution still photos spread
 * across the hold window (so a deliberate pan across a curved can, jar, or a
 * label too long for one frame is captured across the burst, right from the
 * start — not as a reactive "that wasn't enough, try again" second pass),
 * OCRs each photo, and combines them (see burst.ts) into one paragraph.
 *
 * Replaces an earlier design that ran OCR continuously on the live preview
 * and stitched together the small text blocks recognized across ~9 lower-
 * resolution frames. That approach had a real bug (found 2026-09-13 from a
 * real device scan): blocks from different, only slightly time-shifted
 * frames got concatenated in temporal (arrival) order with no cross-frame
 * spatial alignment, so a hand's natural micro-drift during the hold could
 * scramble English/French/nutrition-panel text together in the wrong order.
 * A handful of real, full-resolution photos — each internally coherent,
 * captured in a genuine left-to-right/top-to-bottom pan order — avoids that
 * failure mode entirely. The live frame processor below is kept ONLY for
 * the cosmetic "Reading label…" cue; it no longer supplies the text that
 * actually gets scanned.
 *
 * NOTE: requires a dev/EAS build (native modules). Cannot run in Expo Go or
 * the sandbox. See docs/14 "Definition of done".
 */

const SCAN_SECONDS = 3;
const SHOT_COUNT = 3;
// Spread evenly across the hold window (e.g. 500ms/1500ms/2500ms for a
// 3s/3-shot burst) so a natural pan is captured across the whole burst.
const SHOT_DELAYS_MS = Array.from({ length: SHOT_COUNT }, (_, i) =>
  Math.round(((i + 0.5) / SHOT_COUNT) * SCAN_SECONDS * 1000)
);

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

  const [countdown, setCountdown] = useState(SCAN_SECONDS);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [sawText, setSawText] = useState(false);

  const finishedRef = useRef(false);
  const shotPromisesRef = useRef<Promise<BurstShot>[]>([]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Cosmetic only: turns the guide cyan + "Reading label…" once the live
  // preview sees any text, so the user gets feedback while framing the
  // shot. Not used for the text that's actually scanned (see burst.ts).
  const onFrameResult = useRunOnJS(
    (result: MLKitText[]) => {
      if (finishedRef.current) return;
      if (toRecognizedBlocks(result).length > 0) setSawText(true);
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

  // Take one real photo and OCR it. A single failed shot (camera busy, a
  // hiccup mid-capture) shouldn't sink the whole burst — return an empty
  // shot and let the other photos carry the scan.
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

  // Schedule the burst once the camera is ready — SHOT_COUNT stills spread
  // across the hold window.
  useEffect(() => {
    if (!hasPermission || !device) return;
    const timers = SHOT_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        if (finishedRef.current) return;
        shotPromisesRef.current.push(takeShot());
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [hasPermission, device, takeShot]);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setScanning(false);
    setProcessing(true);
    const shots = await Promise.all(shotPromisesRef.current);
    onCapture(combineBurst(shots));
  }, [onCapture]);

  // Countdown → finish once every scheduled shot has been taken and OCR'd.
  useEffect(() => {
    if (!scanning) return;
    if (countdown <= 0) {
      finish();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, scanning, finish]);

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

  return (
    <View style={styles.fill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={scanning}
        frameProcessor={frameProcessor}
        photo={true}
        pixelFormat="yuv"
      />

      {/* Centre framing guide — aim the ingredient list inside it. */}
      <View style={styles.guideWrap} pointerEvents="none">
        <View
          style={[
            styles.guide,
            { borderColor: sawText ? t.colors.cyan : "rgba(255,255,255,0.6)" },
          ]}
        />
        <View style={[styles.pill, { backgroundColor: t.colors.card }]}>
          <Text tone={sawText ? "cyan" : "muted"} bold>
            {processing ? "Reading label…" : sawText ? "Reading label…" : "Point at the ingredient list"}
          </Text>
        </View>
      </View>

      {/* Countdown pill + cancel — swaps to a processing note once the hold
          window ends and the burst's photos are still being OCR'd. */}
      <View style={styles.hud} pointerEvents="box-none">
        <View style={[styles.pill, { backgroundColor: t.colors.card }]}>
          <Text tone="cyan" bold>
            {processing ? "Analyzing photos…" : `Hold steady, pan if needed… ${countdown}s`}
          </Text>
        </View>
        {!processing && <Button title="Cancel" kind="secondary" onPress={onCancel} />}
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

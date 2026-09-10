import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from "react-native-vision-camera";
import { useTextRecognition } from "react-native-vision-camera-text-recognition";
import { useRunOnJS } from "react-native-worklets-core";
import { Text, Button } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { assembleParagraph, pickBestFrameText, RecognizedBlock } from "./stitch";
import { toRecognizedBlocks, MLKitText } from "./recognition";

/**
 * Live 3-second scanner (docs/06 Step 1 / docs/14). No shutter: the user points,
 * frames are recognized on-device, deduped+stitched into one paragraph, then
 * handed to `onCapture`. Designed for curved surfaces (cans/jars): panning across
 * the curve lets multiple frames cover text a single photo would distort.
 *
 * NOTE: requires a dev/EAS build (native modules). Cannot run in Expo Go or the
 * sandbox. See docs/14 "Definition of done".
 */

const SCAN_SECONDS = 3;

export interface CameraScannerProps {
  onCapture: (paragraph: string) => void;
  onCancel: () => void;
}

export function CameraScanner({ onCapture, onCancel }: CameraScannerProps) {
  const t = useTheme();
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const { scanText } = useTextRecognition({ language: "latin" });

  const [countdown, setCountdown] = useState(SCAN_SECONDS);
  const [scanning, setScanning] = useState(true);
  const [sawText, setSawText] = useState(false);

  // Frames accumulated during the 3-second window.
  const framesRef = useRef<RecognizedBlock[][]>([]);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Called from the worklet with the raw ML Kit result. The tuple→block adapter
  // (`toRecognizedBlocks`) is plain JS — it can't run on the worklet thread — so
  // the worklet just marshals the raw result over and we convert here on JS.
  const onFrameResult = useRunOnJS(
    (result: MLKitText[]) => {
      if (finishedRef.current) return;
      const blocks = toRecognizedBlocks(result);
      framesRef.current.push(blocks);
      if (blocks.length > 0) setSawText(true);
    },
    []
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      // ~3 fps is plenty for a label and keeps CPU + frame-to-frame noise down.
      runAtTargetFps(3, () => {
        "worklet";
        const result = scanText(frame) as unknown as MLKitText[];
        onFrameResult(result);
      });
    },
    [scanText, onFrameResult]
  );

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setScanning(false);
    // A single well-framed capture beats stitching many noisy ones; fall back to
    // stitching only when no frame clearly saw an ingredient list (curved cans).
    const best = pickBestFrameText(framesRef.current);
    const paragraph = best || assembleParagraph(framesRef.current);
    framesRef.current = [];
    onCapture(paragraph);
  }, [onCapture]);

  // 3-second countdown → finish (docs/06: at 0s, stitching stops).
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
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={scanning}
        frameProcessor={frameProcessor}
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
            {sawText ? "Reading label…" : "Point at the ingredient list"}
          </Text>
        </View>
      </View>

      {/* Countdown pill + cancel */}
      <View style={styles.hud} pointerEvents="box-none">
        <View style={[styles.pill, { backgroundColor: t.colors.card }]}>
          <Text tone="cyan" bold>
            Hold steady… {countdown}s
          </Text>
        </View>
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

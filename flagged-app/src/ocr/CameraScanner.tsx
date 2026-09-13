import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { recognizeText } from "vision-ocr";
import { Text, Button } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { photoResultToParagraph } from "./recognition";

/**
 * Manual-shutter scanner (docs/14, 2026-09-13) — deliberately stripped back
 * to the simplest thing that reliably works: point the camera, tap the
 * button, take one photo, run OCR on it, done. No auto-trigger off a live
 * frame-processor readiness signal, no crop/perspective-correction step, no
 * multi-shot anything.
 *
 * This replaces a much more elaborate pipeline built up over a long run of
 * real-device fixes on 2026-09-13 (spatial/textual completeness heuristics,
 * multi-shot reconciliation, several reading-order sorting attempts,
 * perspective-corrected manual cropping with draggable corners) that,
 * despite each individual fix being real and evidence-based, left the
 * capture flow fragile enough to break in new ways on every change — most
 * recently an indefinite hang and a broken layout. Explicit direction:
 * strip it back to something that just works, rather than layering another
 * fix on an already-overcomplicated flow. Nothing here depends on the
 * live-frame OCR proxy (`useFrameProcessor`/the vision-ocr frame-processor
 * plugin) that was the single most repeated source of failures tonight
 * ("Can't load the visionScanText frame processor plugin") — the camera
 * view has no frame processor attached at all now.
 *
 * Renders INLINE inside the Scan tab's own existing viewfinder box (docs/05)
 * — never a full-screen takeover — via `useCameraCapture`, which returns
 * `{boxContent, footer}` for the caller to drop into the same box/button
 * slots its idle state uses.
 *
 * NOTE: requires a dev/EAS build (native camera module). Cannot run in
 * Expo Go or the sandbox. See docs/14 "Definition of done".
 */

export interface UseCameraCaptureOptions {
  /** Whether the scan flow is currently engaged — false means "show your
   * own idle content instead," not "unmount the camera hardware." */
  active: boolean;
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

export function useCameraCapture({ active, onCapture, onCancel }: UseCameraCaptureOptions): CameraCaptureUI {
  const t = useTheme();
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (active && !hasPermission) requestPermission();
  }, [active, hasPermission, requestPermission]);

  useEffect(() => {
    if (active) {
      setBusy(false);
      setError(null);
    }
  }, [active]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy) return;
    setError(null);
    setBusy(true);
    try {
      const photo = await camera.takePhoto({ flash: "off" });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      const result = await recognizeText(uri);
      onCapture(photoResultToParagraph(result));
    } catch {
      setError("Couldn't read that photo. Try again.");
      setBusy(false);
    }
  }, [busy, onCapture]);

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

    return {
      boxContent: (
        <View style={styles.fill}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={active}
            photo={true}
          />
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
        </View>
      ),
      footer: (
        <View style={{ gap: t.spacing.sm }}>
          <Button title={busy ? "Reading…" : "📸  Capture"} onPress={handleCapture} disabled={busy} />
          <Button title="Cancel" kind="secondary" onPress={onCancel} />
        </View>
      ),
    };
  }, [active, device, hasPermission, requestPermission, busy, error, handleCapture, onCancel, t]);
}

const styles = StyleSheet.create({
  // width: "100%" matters here: the parent box (Scan tab) centers its
  // children rather than stretching them, and a view whose only children
  // are absolutely positioned (the camera feed, the guide overlay) has no
  // intrinsic width of its own to report — without an explicit width it
  // collapses to a sliver (a real device miss, 2026-09-13).
  fill: { flex: 1, width: "100%" },
  center: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
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

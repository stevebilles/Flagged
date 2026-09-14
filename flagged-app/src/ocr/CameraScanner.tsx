import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { recognizeText, getImageSize, correctPerspective } from "vision-ocr";
import { Text, Button } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { photoResultToParagraph } from "./recognition";
import { stitch } from "./stitch";
import { GUIDE_WIDTH_FRACTION, GUIDE_HEIGHT_FRACTION, guideBoxToPhotoCorners } from "./guideBox";

/**
 * Manual-shutter, fixed-frame scanner (docs/14, 2026-09-13), rendered INLINE
 * inside the Scan tab's own existing viewfinder box (docs/05) — never a
 * full-screen takeover. `useCameraCapture` returns exactly two pieces of UI
 * — `boxContent` and `footer` — for the caller to drop into the same
 * box/button slots its idle state uses.
 *
 * Capture is a plain tap of a shutter button — deliberately NOT triggered
 * automatically off a live frame-processor readiness signal, which was the
 * single most repeated point of failure across a long run of real-device
 * fixes on 2026-09-13 and was never actually asked for.
 *
 * There is no manual crop step (removed 2026-09-13, real user feedback: the
 * corner-drag tool was slow, and every real failure mode it produced —
 * crop-too-small limits, edge-clipped bleed, drift across silently-taken
 * extra shots — was a bug in that tool, not something a user actually
 * wanted to spend time on). OCR is instead automatically restricted to
 * whatever's inside the dashed cyan guide box shown during the live
 * preview — see `guideBoxToPhotoCorners` below — which the user aims
 * before tapping the shutter, same as before, just without a second
 * after-the-fact adjustment step.
 *
 * The result is also no longer shown back to the user as a raw paragraph to
 * proofread (2026-09-13: OCR will never be 100% typo-free on real glossy
 * print, on any engine — displaying its raw output as if it were a finished
 * transcript made the app look unreliable even when the underlying red-flag
 * match was already correct). The matcher (matcher.ts) already tolerates
 * exactly this kind of letter noise, and the results screen shows only the
 * matched red-flag term's own correct spelling, never the raw OCR token —
 * so there's nothing here for the user to review before trusting a result.
 *
 * "Add more" repeats the capture for a second, different photo (e.g. the
 * list wraps around a curved package or is too wide for one frame) and
 * joins the two reads (stitch, stitch.ts) — still no text is ever shown to
 * the user; this only affects what gets matched against their filters.
 *
 * NOTE: requires a dev/EAS build (native camera + vision-ocr modules).
 * Cannot run in Expo Go or the sandbox. See docs/14 "Definition of done".
 */

type Phase = "waiting" | "processing" | "shotDone";

export interface UseCameraCaptureOptions {
  /** Whether the scan flow is currently engaged — false means "show your
   * own idle content instead," not "unmount the camera hardware." */
  active: boolean;
  /** The viewfinder box's own measured size (onLayout) — needed to map the
   * guide box's screen position into the captured photo's pixel space (see
   * guideBoxToPhotoCorners); the live camera feed itself just fills
   * whatever it's given. */
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

  const [phase, setPhase] = useState<Phase>("waiting");
  const [error, setError] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const accumulatedRef = useRef("");

  // Starting a fresh scan (including re-engaging after a previous one
  // finished) always begins from a clean slate.
  useEffect(() => {
    if (!active) return;
    finishedRef.current = false;
    accumulatedRef.current = "";
    setError(null);
    setPhase("waiting");
  }, [active]);

  useEffect(() => {
    if (active && !hasPermission) requestPermission();
  }, [active, hasPermission, requestPermission]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || boxWidth <= 0 || boxHeight <= 0) return;
    setError(null);
    setPhase("processing");
    try {
      const photo = await camera.takePhoto({ flash: "off" });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      const { width, height } = await getImageSize(uri);
      const corners = guideBoxToPhotoCorners(boxWidth, boxHeight, width, height);
      const correctedUri = await correctPerspective(uri, corners);
      const result = await recognizeText(correctedUri);
      if (__DEV__) {
        // Diagnostic only (docs/06/14): confirms the guide-box crop actually
        // lines up with the dashed lines (verify box/photo dims + corners
        // against what was visibly framed) and that the corrected image's
        // blocks read as plausible, non-tilted lines. Grep Metro for "BLOCKS".
        // eslint-disable-next-line no-console
        console.log(
          `\n▓▓▓ GUIDE BOX CROP ▓▓▓ box=${Math.round(boxWidth)}x${Math.round(boxHeight)} ` +
            `photo=${Math.round(width)}x${Math.round(height)} corners=${JSON.stringify(corners)}`
        );
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
      // This image is the hard-cropped output of correctPerspective, not an
      // original uncropped photo — drop any line the guide box's edge
      // sliced through (recognition.ts) rather than letting a Nutrition
      // Facts footnote or second-language repeat bleed in from just outside
      // the dashed lines.
      const text = photoResultToParagraph(result, { dropEdgeClippedText: true });
      accumulatedRef.current = stitch(accumulatedRef.current, text);
      setPhase("shotDone");
    } catch {
      setError("Couldn't read that photo. Try again.");
      setPhase("waiting");
    }
  }, [boxWidth, boxHeight]);

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
    // "waiting") so switching phases never pays the cost of tearing down
    // and reinitializing the hardware. Phase-specific content is layered
    // OVER it, opaque, so nothing but the live feed itself is actually
    // hidden.
    const cameraLayer = (
      <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive={active} photo={true} />
    );

    let overlay: React.ReactNode = null;
    let footer: React.ReactNode;

    if (phase === "processing") {
      overlay = (
        <View style={[styles.center, styles.overlayOpaque, { backgroundColor: t.colors.canvas }]}>
          <Text tone="cyan" bold>
            Reading the label…
          </Text>
        </View>
      );
      footer = null;
    } else if (phase === "shotDone") {
      overlay = (
        <View
          style={[
            styles.center,
            styles.overlayOpaque,
            { backgroundColor: t.colors.canvas, padding: t.spacing.lg, gap: t.spacing.sm },
          ]}
        >
          <Text variant="heading" bold tone="cyan" style={{ textAlign: "center" }}>
            Got it!
          </Text>
          <Text variant="title" style={{ textAlign: "center" }}>
            Was the whole{"\n"}ingredient list in frame?
          </Text>
        </View>
      );
      footer = (
        <View style={{ gap: t.spacing.sm }}>
          <Button title="Done" onPress={handleDone} />
          <Button
            title="Scan more (list continues elsewhere on the package)"
            kind="secondary"
            onPress={handleAddMore}
          />
          <Button title="Cancel" kind="secondary" onPress={onCancel} />
        </View>
      );
    } else {
      // waiting — live camera feed + aim guide + shutter button.
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
          <Button title="📸  Capture" onPress={handleCapture} />
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
    error,
    handleCapture,
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
    width: `${GUIDE_WIDTH_FRACTION * 100}%`,
    height: `${GUIDE_HEIGHT_FRACTION * 100}%`,
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

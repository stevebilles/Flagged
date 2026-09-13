import { useMemo } from "react";
import { NativeModules } from "react-native";
import { VisionCameraProxy } from "react-native-vision-camera";
import type { Frame } from "react-native-vision-camera";

/** One recognized text block, already in plain top-left-origin pixel
 * coordinates of the upright photo (see VisionOcrPhotoModule.swift). */
export interface VisionOcrBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionOcrResult {
  text: string;
  blocks: VisionOcrBlock[];
}

/** A single corner, in plain top-left-origin pixel coordinates of the
 * upright photo — same convention as VisionOcrBlock. */
export interface CornerPoint {
  x: number;
  y: number;
}

export interface DocumentCorners {
  topLeft: CornerPoint;
  topRight: CornerPoint;
  bottomLeft: CornerPoint;
  bottomRight: CornerPoint;
}

const { VisionOcrPhotoModule } = NativeModules;

/** Runs Apple Vision (accurate mode) on a captured photo file (docs/06). */
export function recognizeText(uri: string): Promise<VisionOcrResult> {
  return VisionOcrPhotoModule.recognize(uri);
}

export interface DetectedDocument {
  /** The photo's own upright pixel dimensions — the SAME calculation
   * `correctPerspective` uses internally, so callers should build their
   * screen<->image coordinate mapping from this rather than a separately-
   * reported size (e.g. the camera library's own photo.width/height),
   * which isn't guaranteed to agree with what this module considers
   * "upright" (docs/06, 2026-09-13 — a real, previously-costly mismatch of
   * exactly this kind, from ML Kit's own unrelated rotation bug). */
  width: number;
  height: number;
  /** A starting quad for the user to confirm/drag on the corner-review
   * screen (docs/14), from Vision's own rectangle detector — `null` when
   * nothing confident is found (a curved or low-contrast package, say), a
   * normal outcome, not an error; callers should fall back to a default
   * box in that case. */
  corners: DocumentCorners | null;
}

export function detectDocumentCorners(uri: string): Promise<DetectedDocument> {
  return VisionOcrPhotoModule.detectDocumentCorners(uri);
}

/**
 * Flattens whatever's inside the four user-confirmed corners into an
 * upright rectangular image (perspective correction — the same technique
 * document-scanner apps use) and returns the corrected image's file URI.
 * Run `recognizeText` on THIS result, not the original photo — fixing the
 * tilt at the source, rather than compensating for it in text-ordering
 * logic, is what actually solved the reading-order bugs found 2026-09-13.
 */
export function correctPerspective(uri: string, corners: DocumentCorners): Promise<string> {
  return VisionOcrPhotoModule.correctPerspective(uri, corners);
}

/**
 * Live-preview readiness signal (Vision fast mode) — call the returned
 * function from a `useFrameProcessor` worklet.
 *
 * Registers the native frame-processor plugin lazily, at component render
 * time (`useMemo`), not at module-import time — a real device failure
 * (2026-09-13) showed `VisionCameraProxy.initFrameProcessorPlugin` called at
 * module top-level returning null ("Can't load the visionScanText frame
 * processor plugin"), even though the native module was correctly compiled
 * and linked (confirmed from the actual Xcode build log — `-lVisionOcr` and
 * `-ObjC` both present in the final link command). `vision-ocr` gets
 * imported as part of very early JS bundle evaluation, which can run before
 * VisionCamera's own native proxy has finished installing its JSI bindings;
 * calling this from a hook defers it to component render, well after app
 * startup — the same timing the original ML Kit plugin's `useTextRecognition`
 * hook used, never at import time.
 */
export function useVisionScanText() {
  return useMemo(() => {
    const plugin = VisionCameraProxy.initFrameProcessorPlugin("visionScanText", {});
    if (!plugin) {
      throw new Error("Can't load the visionScanText frame processor plugin. Try cleaning cache or rebuilding.");
    }
    return (frame: Frame): { text: string } => {
      "worklet";
      // @ts-ignore - plugin.call's return type isn't generic
      return plugin.call(frame) as { text: string };
    };
  }, []);
}

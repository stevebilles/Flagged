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

const { VisionOcrPhotoModule } = NativeModules;

/** Runs Apple Vision (accurate mode) on a captured photo file (docs/06). */
export function recognizeText(uri: string): Promise<VisionOcrResult> {
  return VisionOcrPhotoModule.recognize(uri);
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

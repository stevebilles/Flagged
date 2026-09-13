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

const plugin = VisionCameraProxy.initFrameProcessorPlugin("visionScanText", {});

/** Live-preview readiness signal (Vision fast mode) — call from a
 * `useFrameProcessor` worklet. Returns the frame's roughly-recognized text;
 * never used for anything that gets matched (see CameraScanner.tsx). */
export function visionScanText(frame: Frame): { text: string } {
  "worklet";
  if (!plugin) {
    throw new Error("Can't load the visionScanText frame processor plugin. Try cleaning cache or rebuilding.");
  }
  // @ts-ignore - plugin.call's return type isn't generic
  return plugin.call(frame) as { text: string };
}

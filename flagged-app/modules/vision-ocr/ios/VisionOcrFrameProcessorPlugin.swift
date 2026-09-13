import Foundation
import VisionCamera
import Vision

/**
 * Live-preview readiness signal (docs/06, 2026-09-13) — the SAME Vision
 * engine as the still-photo path (VisionOcrPhotoModule), just in Vision's
 * ".fast" mode with no language correction, since this only decides WHEN to
 * trigger the real capture and never supplies text that gets matched. One
 * engine for both jobs, not two different OCR stacks glued together.
 */
@objc(VisionOcrFrameProcessorPlugin)
public class VisionOcrFrameProcessorPlugin: FrameProcessorPlugin {

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(frame.buffer) else { return ["text": ""] }
    let orientation = VisionOcrFrameProcessorPlugin.cgOrientation(from: frame.orientation)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
      let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
      let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
      return ["text": text]
    } catch {
      return ["text": ""]
    }
  }

  private static func cgOrientation(from uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch uiOrientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}

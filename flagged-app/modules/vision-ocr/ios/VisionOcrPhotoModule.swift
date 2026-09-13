import Foundation
import UIKit
import React
import Vision

/**
 * Runs Apple's on-device Vision text recognition on a captured photo file
 * (docs/06, 2026-09-13 — replaces Google ML Kit entirely: ML Kit's iOS port
 * treats iOS as a secondary target behind Android and its accuracy proved
 * poor on small, dense, glossy print, independent of any app-level
 * fusion/voting logic layered on top of it).
 *
 * Unlike the previous ML Kit plugin, this does NOT need a caller-supplied
 * orientation hint: `UIImage(contentsOfFile:)` already reads the photo's own
 * EXIF orientation tag into `imageOrientation`, and Vision's request handler
 * takes that orientation directly — a documented Apple API contract, not
 * something reverse-engineered from device evidence.
 *
 * Bounding boxes come back already converted to plain top-left-origin pixel
 * coordinates of the UPRIGHT (correctly-oriented) image — Vision's own
 * normalized, bottom-left-origin convention is converted here, once, at the
 * native boundary, so nothing downstream in the JS pipeline has to know
 * about it (see `docs/14`, `src/ocr/recognition.ts`).
 */
@objc(VisionOcrPhotoModule)
class VisionOcrPhotoModule: NSObject {

  @objc(recognize:withResolver:withRejecter:)
  private func recognize(
    uri: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let path = uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
    guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
      reject("Error", "Can't find or decode photo at \(uri)", nil)
      return
    }

    let orientation = VisionOcrPhotoModule.cgOrientation(from: image.imageOrientation)
    let (uprightWidth, uprightHeight) = VisionOcrPhotoModule.uprightSize(cgImage: cgImage, orientation: orientation)

    let request = VNRecognizeTextRequest { request, error in
      if let error = error {
        reject("Error", "Vision recognition failed: \(error.localizedDescription)", nil)
        return
      }
      let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
      var blocks: [[String: Any]] = []
      var fullText: [String] = []
      for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        fullText.append(candidate.string)
        // Vision's boundingBox is normalized (0...1) with origin at the
        // BOTTOM-left of the upright image (Apple's documented convention).
        // Flip Y to get plain top-left-origin pixel coordinates.
        let box = observation.boundingBox
        blocks.append([
          "text": candidate.string,
          "x": box.origin.x * uprightWidth,
          "y": (1 - box.origin.y - box.height) * uprightHeight,
          "width": box.width * uprightWidth,
          "height": box.height * uprightHeight,
        ])
      }
      resolve([
        "text": fullText.joined(separator: "\n"),
        "blocks": blocks,
      ])
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      reject("Error", "Processing image: \(error.localizedDescription)", nil)
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

  /** A 90°/270° orientation swaps which raw CGImage dimension is visually
   * width vs. height once the image is displayed upright. */
  private static func uprightSize(cgImage: CGImage, orientation: CGImagePropertyOrientation) -> (CGFloat, CGFloat) {
    let rawWidth = CGFloat(cgImage.width)
    let rawHeight = CGFloat(cgImage.height)
    switch orientation {
    case .left, .right, .leftMirrored, .rightMirrored:
      return (rawHeight, rawWidth)
    default:
      return (rawWidth, rawHeight)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}

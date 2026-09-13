import Foundation
import UIKit
import React
import Vision
import CoreImage

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

  /**
   * The photo's own upright pixel dimensions — the SAME calculation
   * `correctPerspective` uses internally, so callers should build their
   * screen<->image coordinate mapping from THIS rather than a separately-
   * reported size (e.g. the camera library's own `photo.width`/`height`),
   * which isn't guaranteed to agree with what this module considers
   * "upright" (docs/06, 2026-09-13 — a real, previously-costly mismatch of
   * exactly this kind, from ML Kit's own unrelated rotation bug). Just
   * decodes the image header — no Vision inference, near-instant, so
   * nothing about the corner-review screen's own layout has to wait on the
   * (much slower, best-effort) rectangle detector below.
   */
  @objc(getImageSize:withResolver:withRejecter:)
  private func getImageSize(
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
    resolve(["width": uprightWidth, "height": uprightHeight])
  }

  /**
   * Suggests a starting quad for the user to adjust (docs/14 corner-review
   * step) using Vision's own rectangle detector — this only ever pre-fills
   * a starting position; the user always confirms or drags it before
   * anything is cropped/corrected. Resolves `null` (not a rejection) when
   * nothing confident is found, so the caller falls back to a plain default
   * box — no detected rectangle is a normal, expected outcome for a curved
   * or low-contrast package, not an error.
   *
   * A real device test (2026-09-13) found rectangle search can take far
   * longer than plain text recognition on a full-resolution photo — long
   * enough that even a same-process dispatch-queue timeout here wasn't
   * reliably winning the race on slower hardware. Since this is ONLY EVER a
   * starting suggestion, never something worth the user waiting on, the
   * caller races this against its OWN timeout on the JS side (independent
   * of whatever this native call's queue is doing) and treats a slow
   * response exactly like a `null` one.
   */
  @objc(detectDocumentCorners:withResolver:withRejecter:)
  private func detectDocumentCorners(
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

    DispatchQueue.global(qos: .userInitiated).async {
      let request = VNDetectRectanglesRequest { request, error in
        if error != nil {
          resolve(NSNull())
          return
        }
        guard let best = (request.results as? [VNRectangleObservation])?.first else {
          resolve(NSNull())
          return
        }
        // Vision's corner points are normalized (0...1), origin at the
        // BOTTOM-left of the upright image — same convention as
        // observation.boundingBox in `recognize` above. Flip Y for plain
        // top-left-origin pixel coordinates.
        func toPixel(_ p: CGPoint) -> [String: Any] {
          return ["x": p.x * uprightWidth, "y": (1 - p.y) * uprightHeight]
        }
        resolve([
          "topLeft": toPixel(best.topLeft),
          "topRight": toPixel(best.topRight),
          "bottomLeft": toPixel(best.bottomLeft),
          "bottomRight": toPixel(best.bottomRight),
        ])
      }
      request.minimumConfidence = 0.6
      request.maximumObservations = 1
      // A printed panel on packaging, not necessarily a full sheet of paper —
      // allow a wide range of shapes/tilts rather than Vision's stricter
      // document-page defaults.
      request.minimumAspectRatio = 0.2
      request.maximumAspectRatio = 1.0
      request.quadratureTolerance = 30

      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
      do {
        try handler.perform([request])
      } catch {
        resolve(NSNull())
      }
    }
  }

  /**
   * Flattens whatever's inside the four user-confirmed corners (docs/14) into
   * an upright rectangular image — the same perspective-correction technique
   * document-scanner apps use, which is what actually fixes the root cause
   * behind several 2026-09-13 reading-order bugs: a tilted photo makes
   * Vision's axis-aligned text boxes come back inflated/skewed, which no
   * amount of downstream sorting logic can fully compensate for. Runs
   * `recognizeText` on the CORRECTED image afterwards, not the raw photo.
   *
   * `corners` are in the same plain top-left-origin pixel space as
   * `detectDocumentCorners`/`recognize`'s blocks — Core Image's own
   * coordinate space has origin at the BOTTOM-left, so this flips Y once,
   * at the boundary, the same way `recognize` does for Vision's convention.
   */
  @objc(correctPerspective:corners:withResolver:withRejecter:)
  private func correctPerspective(
    uri: String,
    corners: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let path = uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
    guard let image = UIImage(contentsOfFile: path) else {
      reject("Error", "Can't find or decode photo at \(uri)", nil)
      return
    }
    // CIImage(image:) does NOT apply UIImage.imageOrientation the way
    // rendering/display does — bake it into the pixel data first so this
    // operates on the same upright image the corner points were measured
    // against.
    guard let upright = VisionOcrPhotoModule.uprightUIImage(image), let ciImage = CIImage(image: upright) else {
      reject("Error", "Couldn't prepare image for perspective correction", nil)
      return
    }
    let height = ciImage.extent.height

    func toCIPoint(_ dict: NSDictionary?) -> CGPoint? {
      guard let x = (dict?["x"] as? NSNumber)?.doubleValue, let y = (dict?["y"] as? NSNumber)?.doubleValue else {
        return nil
      }
      return CGPoint(x: x, y: height - y) // flip to Core Image's bottom-left origin
    }
    guard
      let topLeft = toCIPoint(corners["topLeft"] as? NSDictionary),
      let topRight = toCIPoint(corners["topRight"] as? NSDictionary),
      let bottomLeft = toCIPoint(corners["bottomLeft"] as? NSDictionary),
      let bottomRight = toCIPoint(corners["bottomRight"] as? NSDictionary)
    else {
      reject("Error", "Missing or invalid corner points", nil)
      return
    }

    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else {
      reject("Error", "CIPerspectiveCorrection unavailable", nil)
      return
    }
    filter.setValue(ciImage, forKey: kCIInputImageKey)
    filter.setValue(CIVector(cgPoint: topLeft), forKey: "inputTopLeft")
    filter.setValue(CIVector(cgPoint: topRight), forKey: "inputTopRight")
    filter.setValue(CIVector(cgPoint: bottomLeft), forKey: "inputBottomLeft")
    filter.setValue(CIVector(cgPoint: bottomRight), forKey: "inputBottomRight")

    guard let output = filter.outputImage else {
      reject("Error", "Perspective correction failed", nil)
      return
    }
    let context = CIContext()
    guard let cgOutput = context.createCGImage(output, from: output.extent) else {
      reject("Error", "Couldn't render corrected image", nil)
      return
    }
    let outputImage = UIImage(cgImage: cgOutput)
    guard let data = outputImage.jpegData(compressionQuality: 0.92) else {
      reject("Error", "Couldn't encode corrected image", nil)
      return
    }
    let outPath = NSTemporaryDirectory() + UUID().uuidString + ".jpg"
    do {
      try data.write(to: URL(fileURLWithPath: outPath))
      resolve("file://" + outPath)
    } catch {
      reject("Error", "Couldn't save corrected image: \(error.localizedDescription)", nil)
    }
  }

  /** Redraws the image into a fresh bitmap context so its pixel data
   * matches its own reported (already-upright) orientation — needed
   * because CIImage(image:) ignores UIImage.imageOrientation. */
  private static func uprightUIImage(_ image: UIImage) -> UIImage? {
    if image.imageOrientation == .up { return image }
    UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
    defer { UIGraphicsEndImageContext() }
    image.draw(in: CGRect(origin: .zero, size: image.size))
    return UIGraphicsGetImageFromCurrentImageContext()
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

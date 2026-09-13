import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, StyleSheet, PanResponder, Image, GestureResponderEvent, PanResponderGestureState } from "react-native";
import type { DocumentCorners, CornerPoint } from "vision-ocr";

/**
 * The draggable crop tool (docs/14, 2026-09-13) — shown on the CAPTURED
 * PHOTO, never the live camera: the user is holding the product in one
 * hand and the phone in the other during capture, so there's no way for
 * them to drag anything until the shutter has already fired and they can
 * set the product down. Four corner handles let them box in exactly the
 * ingredient panel (excluding the Nutrition Facts grid, a second-language
 * repeat, etc.) before the photo is perspective-corrected and OCR'd —
 * removing the guesswork (and resulting bugs) of trying to infer the
 * panel's boundaries automatically from OCR text/geometry after the fact.
 *
 * A plain axis-aligned RECTANGLE, not four independently-draggable points
 * (2026-09-13: an earlier version let each corner move freely, which could
 * describe an arbitrary skewed quad for full perspective correction, but
 * real usage found adjusting four independent points too slow — the same
 * one-drag-per-corner interaction every photo-crop tool uses is faster:
 * grab a corner and drag it, the diagonally opposite corner stays anchored,
 * the other two corners follow along the rectangle's edges automatically.
 * Dragging inside the box (not on a handle) moves the whole rectangle in
 * one motion. The tradeoff — this can no longer de-skew a photo taken at a
 * genuine angle — is an acceptable one here: the crop already excludes the
 * Nutrition Facts grid that caused the worst tilt-related reading-order
 * bugs (mixing wildly different font sizes in one image), so a tight plain
 * crop around just the ingredient text is normally enough on its own.
 * `correctPerspective` still runs on the four corners this produces — for
 * an axis-aligned rectangle that's simply a crop, no distortion applied.
 *
 * Renders INLINE, sized to whatever box the caller places it in — the same
 * viewfinder box the idle Scan tab and live camera preview already use
 * (docs/05), not a separate full-screen takeover.
 *
 * A pure, controlled-ish component: drag state is kept locally for smooth
 * per-touch updates (avoiding a full parent re-render on every pixel of
 * movement), but the CURRENT corners (in image-pixel space) are exposed to
 * the caller via a ref (`getCorners()`) rather than a callback-per-frame,
 * since the confirm/retake actions live in the caller's own persistent
 * button row, not inside this component.
 */

type CornerKey = keyof DocumentCorners;
const CORNER_KEYS: CornerKey[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
const HANDLE_SIZE = 40;
// Just enough to keep the box's own math well-defined (never truly zero or
// negative size) — NOT a practical crop-size limit. A real device test
// (2026-09-13) found 48pt stopped the box shrinking well before the user
// was actually done cropping tighter (excluding a second-language line
// sitting right below the English list), letting that text leak into the
// scan. The user should be able to crop as tight as they want.
const MIN_BOX_SIZE = 12;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boundingRect(corners: DocumentCorners): Rect {
  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomLeft.x, corners.bottomRight.x];
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomLeft.y, corners.bottomRight.y];
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

export interface CropBoxHandle {
  getCorners(): DocumentCorners;
}

export interface CropBoxProps {
  containerWidth: number;
  containerHeight: number;
  photoUri: string;
  photoWidth: number;
  photoHeight: number;
  initialCorners: DocumentCorners;
  color: string;
}

export const CropBox = forwardRef<CropBoxHandle, CropBoxProps>(function CropBox(
  { containerWidth, containerHeight, photoUri, photoWidth, photoHeight, initialCorners, color },
  ref
) {
  const scale = Math.min(containerWidth / photoWidth, containerHeight / photoHeight);
  const dispW = photoWidth * scale;
  const dispH = photoHeight * scale;
  const offsetX = (containerWidth - dispW) / 2;
  const offsetY = (containerHeight - dispH) / 2;

  const imageToScreen = (p: CornerPoint) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });
  const screenToImage = (p: CornerPoint): CornerPoint => ({
    x: (p.x - offsetX) / scale,
    y: (p.y - offsetY) / scale,
  });

  const [rect, setRect] = useState<Rect>(() => {
    const r = boundingRect(initialCorners);
    const topLeft = imageToScreen({ x: r.left, y: r.top });
    const bottomRight = imageToScreen({ x: r.right, y: r.bottom });
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
  });
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const dragStartRef = useRef<Rect>(rect);

  useImperativeHandle(ref, () => ({
    getCorners: () => {
      const r = rectRef.current;
      const topLeft = screenToImage({ x: r.left, y: r.top });
      const bottomRight = screenToImage({ x: r.right, y: r.bottom });
      return {
        topLeft,
        topRight: { x: bottomRight.x, y: topLeft.y },
        bottomLeft: { x: topLeft.x, y: bottomRight.y },
        bottomRight,
      };
    },
  }));

  // Resizing from one corner: that corner follows the drag, the diagonally
  // opposite corner stays exactly where the drag started (the "anchor"),
  // and the other two corners follow automatically since the box always
  // stays a plain rectangle.
  const cornerResponders = useMemo(() => {
    const clampX = (v: number) => Math.max(0, Math.min(containerWidth, v));
    const clampY = (v: number) => Math.max(0, Math.min(containerHeight, v));
    const panResponderForCorner = (key: CornerKey) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = rectRef.current;
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const start = dragStartRef.current;
          let { left, top, right, bottom } = start;
          if (key === "topLeft" || key === "bottomLeft") {
            left = Math.min(clampX(start.left + gesture.dx), right - MIN_BOX_SIZE);
          } else {
            right = Math.max(clampX(start.right + gesture.dx), left + MIN_BOX_SIZE);
          }
          if (key === "topLeft" || key === "topRight") {
            top = Math.min(clampY(start.top + gesture.dy), bottom - MIN_BOX_SIZE);
          } else {
            bottom = Math.max(clampY(start.bottom + gesture.dy), top + MIN_BOX_SIZE);
          }
          setRect({ left, top, right, bottom });
        },
      });
    return Object.fromEntries(CORNER_KEYS.map((k) => [k, panResponderForCorner(k)])) as Record<
      CornerKey,
      ReturnType<typeof panResponderForCorner>
    >;
  }, [containerWidth, containerHeight]);

  // Dragging inside the box (not on a handle) moves the whole rectangle in
  // one motion, clamped so it can't be pushed out of the visible photo.
  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = rectRef.current;
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const start = dragStartRef.current;
          const width = start.right - start.left;
          const height = start.bottom - start.top;
          const left = Math.max(0, Math.min(containerWidth - width, start.left + gesture.dx));
          const top = Math.max(0, Math.min(containerHeight - height, start.top + gesture.dy));
          setRect({ left, top, right: left + width, bottom: top + height });
        },
      }),
    [containerWidth, containerHeight]
  );

  const handlePositions: Record<CornerKey, CornerPoint> = {
    topLeft: { x: rect.left, y: rect.top },
    topRight: { x: rect.right, y: rect.top },
    bottomLeft: { x: rect.left, y: rect.bottom },
    bottomRight: { x: rect.right, y: rect.bottom },
  };

  return (
    <View style={[styles.container, { width: containerWidth, height: containerHeight }]}>
      <Image
        source={{ uri: photoUri }}
        style={{ position: "absolute", left: offsetX, top: offsetY, width: dispW, height: dispH }}
        resizeMode="contain"
      />

      {/* Move the whole box by dragging inside it. */}
      <View
        {...moveResponder.panHandlers}
        style={{
          position: "absolute",
          left: rect.left,
          top: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top,
          borderWidth: 2,
          borderColor: color,
        }}
      />

      {CORNER_KEYS.map((key) => (
        <View
          key={key}
          {...cornerResponders[key].panHandlers}
          style={[
            styles.handle,
            {
              left: handlePositions[key].x - HANDLE_SIZE / 2,
              top: handlePositions[key].y - HANDLE_SIZE / 2,
            },
          ]}
        >
          <View style={[styles.handleDot, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  handleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "white",
  },
});

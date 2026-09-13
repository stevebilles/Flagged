import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, StyleSheet, PanResponder, Image, GestureResponderEvent, PanResponderGestureState } from "react-native";
import type { DocumentCorners, CornerPoint } from "vision-ocr";

/**
 * The draggable crop tool (docs/14, 2026-09-13) — shown on the CAPTURED
 * PHOTO, never the live camera: the user is holding the product in one
 * hand and the phone in the other during capture, so there's no way for
 * them to drag anything until the shutter has already fired and they can
 * set the product down. Four draggable corners let them box in exactly the
 * ingredient panel (excluding the Nutrition Facts grid, a second-language
 * repeat, etc.) before the photo is perspective-corrected and OCR'd —
 * removing the guesswork (and resulting bugs) of trying to infer the
 * panel's boundaries automatically from OCR text/geometry after the fact.
 *
 * Renders INLINE, sized to whatever box the caller places it in — the same
 * viewfinder box the idle Scan tab and live camera preview already use
 * (docs/05), not a separate full-screen takeover (2026-09-13: replaced a
 * full-screen review step after real user feedback that the whole Scan tab
 * — header, profile, buttons — shouldn't disappear to scan a label).
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

  const [corners, setCorners] = useState<Record<CornerKey, CornerPoint>>(() => ({
    topLeft: imageToScreen(initialCorners.topLeft),
    topRight: imageToScreen(initialCorners.topRight),
    bottomLeft: imageToScreen(initialCorners.bottomLeft),
    bottomRight: imageToScreen(initialCorners.bottomRight),
  }));
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  const dragStartRef = useRef<CornerPoint>({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    getCorners: () => ({
      topLeft: screenToImage(cornersRef.current.topLeft),
      topRight: screenToImage(cornersRef.current.topRight),
      bottomLeft: screenToImage(cornersRef.current.bottomLeft),
      bottomRight: screenToImage(cornersRef.current.bottomRight),
    }),
  }));

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

  const panResponderFor = (key: CornerKey) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = cornersRef.current[key];
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const next = {
          x: clamp(dragStartRef.current.x + gesture.dx, containerWidth),
          y: clamp(dragStartRef.current.y + gesture.dy, containerHeight),
        };
        setCorners((prev) => ({ ...prev, [key]: next }));
      },
    });

  const responders = useMemo(
    () =>
      Object.fromEntries(CORNER_KEYS.map((k) => [k, panResponderFor(k)])) as Record<
        CornerKey,
        ReturnType<typeof PanResponder.create>
      >,
    []
  );

  return (
    <View style={[styles.container, { width: containerWidth, height: containerHeight }]}>
      <Image
        source={{ uri: photoUri }}
        style={{ position: "absolute", left: offsetX, top: offsetY, width: dispW, height: dispH }}
        resizeMode="contain"
      />

      <Line from={corners.topLeft} to={corners.topRight} color={color} />
      <Line from={corners.topRight} to={corners.bottomRight} color={color} />
      <Line from={corners.bottomRight} to={corners.bottomLeft} color={color} />
      <Line from={corners.bottomLeft} to={corners.topLeft} color={color} />

      {CORNER_KEYS.map((key) => (
        <View
          key={key}
          {...responders[key].panHandlers}
          style={[
            styles.handle,
            {
              left: corners[key].x - HANDLE_SIZE / 2,
              top: corners[key].y - HANDLE_SIZE / 2,
            },
          ]}
        >
          <View style={[styles.handleDot, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
});

function Line({ from, to, color }: { from: CornerPoint; to: CornerPoint; color: string }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: from.x,
        top: from.y - 1,
        width: length,
        height: 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}rad` }],
        // @ts-ignore - transformOrigin (RN 0.73+/Fabric) pivots the rotation
        // at the line's own start point instead of its visual center.
        transformOrigin: "0% 50%",
      }}
    />
  );
}

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

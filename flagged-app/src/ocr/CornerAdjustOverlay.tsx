import React, { useMemo, useRef, useState } from "react";
import { View, StyleSheet, PanResponder, Image, Dimensions, GestureResponderEvent, PanResponderGestureState } from "react-native";
import { Text, Button } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import type { DocumentCorners, CornerPoint } from "vision-ocr";

/**
 * Corner-review screen (docs/14, 2026-09-13): shown on the CAPTURED PHOTO,
 * never the live camera — the user is holding the product in one hand and
 * the phone in the other during capture, so there's no way for them to drag
 * anything until the shutter has already fired and they can set the
 * product down. Four draggable corners let them box in exactly the
 * ingredient panel (excluding the Nutrition Facts grid, a second-language
 * repeat, etc.) before the photo is perspective-corrected and OCR'd —
 * removing the guesswork (and resulting bugs) of trying to infer the
 * panel's boundaries automatically from OCR text/geometry after the fact.
 */

type CornerKey = keyof DocumentCorners;
const CORNER_KEYS: CornerKey[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
const HANDLE_SIZE = 44;

export interface CornerAdjustOverlayProps {
  photoUri: string;
  photoWidth: number;
  photoHeight: number;
  initialCorners: DocumentCorners;
  onConfirm: (corners: DocumentCorners) => void;
  onRetake: () => void;
}

export function CornerAdjustOverlay({
  photoUri,
  photoWidth,
  photoHeight,
  initialCorners,
  onConfirm,
  onRetake,
}: CornerAdjustOverlayProps) {
  const t = useTheme();
  const screen = Dimensions.get("window");
  const containerW = screen.width;
  const containerH = screen.height * 0.72;

  const scale = Math.min(containerW / photoWidth, containerH / photoHeight);
  const dispW = photoWidth * scale;
  const dispH = photoHeight * scale;
  const offsetX = (containerW - dispW) / 2;
  const offsetY = (containerH - dispH) / 2;

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

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

  const panResponderFor = (key: CornerKey) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = cornersRef.current[key];
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const next = {
          x: clamp(dragStartRef.current.x + gesture.dx, containerW),
          y: clamp(dragStartRef.current.y + gesture.dy, containerH),
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

  const handleConfirm = () => {
    onConfirm({
      topLeft: screenToImage(corners.topLeft),
      topRight: screenToImage(corners.topRight),
      bottomLeft: screenToImage(corners.bottomLeft),
      bottomRight: screenToImage(corners.bottomRight),
    });
  };

  return (
    <View style={[styles.fill, { backgroundColor: t.colors.canvas }]}>
      <View style={{ paddingHorizontal: t.spacing.md, paddingTop: t.spacing.lg, paddingBottom: t.spacing.sm }}>
        <Text bold style={{ textAlign: "center" }}>
          Drag the corners to box in just the ingredient list
        </Text>
      </View>

      <View style={[styles.imageContainer, { width: containerW, height: containerH }]}>
        <Image
          source={{ uri: photoUri }}
          style={{ position: "absolute", left: offsetX, top: offsetY, width: dispW, height: dispH }}
          resizeMode="contain"
        />

        <Line from={corners.topLeft} to={corners.topRight} color={t.colors.cyan} />
        <Line from={corners.topRight} to={corners.bottomRight} color={t.colors.cyan} />
        <Line from={corners.bottomRight} to={corners.bottomLeft} color={t.colors.cyan} />
        <Line from={corners.bottomLeft} to={corners.topLeft} color={t.colors.cyan} />

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
            <View style={[styles.handleDot, { backgroundColor: t.colors.cyan }]} />
          </View>
        ))}
      </View>

      <View style={{ padding: t.spacing.md, gap: t.spacing.sm }}>
        <Button title="Use this photo" onPress={handleConfirm} />
        <Button title="Retake" kind="secondary" onPress={onRetake} />
      </View>
    </View>
  );
}

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
  fill: { flex: 1 },
  imageContainer: { alignSelf: "center", overflow: "hidden" },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  handleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "white",
  },
});

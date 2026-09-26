import React from "react";
import { Modal, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, Card, Button, withAlpha } from "./components";
import { useTheme } from "./ThemeProvider";
import { NON_ENGLISH_WARNING } from "../matching/language";

/**
 * The "this scan isn't English" warning (owner, 2026-09-25) — drawn by the app itself, in the app's
 * own style, NOT the phone's native alert (which looked like an iOS notification, not part of Flagged).
 * It has exactly ONE way out: scan again. There is deliberately no "continue anyway" — a scan of the
 * wrong language can't be trusted, so the only path forward is scanning the English ingredient list.
 * Not dismissible by tapping outside it. Shared by the Scan tab and the recheck capture screen.
 */
export function LanguageWarning({ visible, onScanAgain }: { visible: boolean; onScanAgain: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onScanAgain} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: t.spacing.lg,
          backgroundColor: withAlpha(t.colors.canvas, 0.85),
        }}
      >
        <Card
          style={{
            width: "100%",
            maxWidth: 420,
            gap: t.spacing.md,
            borderWidth: 1,
            borderColor: withAlpha(t.colors.warning, 0.5),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                borderWidth: 2,
                borderColor: t.colors.warning,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="language" size={24} color={t.colors.warning} />
            </View>
            <Text variant="title" bold tone="warning" style={{ flex: 1 }}>
              {NON_ENGLISH_WARNING.title}
            </Text>
          </View>
          <Text>{NON_ENGLISH_WARNING.message}</Text>
          <Button title={NON_ENGLISH_WARNING.scanAgain} onPress={onScanAgain} />
        </Card>
      </View>
    </Modal>
  );
}

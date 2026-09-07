import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Flagged — Expo app config.
 *
 * Native modules used (require a custom dev client / EAS build, NOT Expo Go):
 *  - react-native-vision-camera (on-device OCR frame processors) — see docs/06
 *  - react-native-purchases (RevenueCat) — see docs/08
 *
 * The app is 100% offline: no network is required for scanning, matching,
 * persistence, or reading the pantry. See docs/02-architecture.md.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Flagged",
  slug: "flagged",
  scheme: "flagged",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic", // supports the dynamic dark/light system, docs/09
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.billesappcoinc.flaggedingredientscanner",
    // iOS 17.0+ deployment target is set via expo-build-properties (see plugins).
    infoPlist: {
      NSCameraUsageDescription:
        "Flagged uses your camera to read the ingredient list on food labels. Images are processed entirely on your device and are never uploaded.",
    },
  },
  android: {
    package: "com.billesappcoinc.flaggedingredientscanner",
    permissions: ["android.permission.CAMERA"],
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-build-properties",
      {
        ios: { deploymentTarget: "17.0" }, // docs/01, docs/02
      },
    ],
    [
      "react-native-vision-camera",
      {
        cameraPermissionText:
          "Flagged uses your camera to read food-label ingredient lists on-device.",
        enableCodeScanner: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});

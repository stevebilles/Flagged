module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Required for VisionCamera frame processors + the vision-ocr worklet.
      "react-native-worklets-core/plugin",
      // Reanimated plugin must be listed LAST.
      "react-native-reanimated/plugin",
    ],
  };
};

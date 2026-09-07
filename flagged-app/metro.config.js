// Default Expo Metro config. The bundled seed (assets/data/ingredients.json)
// is imported via resolveJsonModule; no extra asset config needed.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;

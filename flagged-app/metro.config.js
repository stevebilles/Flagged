// Default Expo Metro config. The bundled seed (assets/data/ingredients.json)
// is imported via resolveJsonModule; no extra asset config needed.
const { getDefaultConfig } = require("expo/metro-config");

// eslint-disable-next-line no-undef -- __dirname is a Node.js global, valid in this CommonJS config file
const config = getDefaultConfig(__dirname);

module.exports = config;

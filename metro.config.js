// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix: "Out of memory: Cannot allocate Wasm memory for new instance"
// This happens when Metro's Hermes WASM transformer exhausts Node.js memory.
// Limiting workers reduces peak memory pressure during bundling.
config.maxWorkers = 2;

module.exports = config;

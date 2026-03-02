const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
const mobileNodeModules = path.resolve(__dirname, "node_modules");
const workspaceNodeModules = path.resolve(__dirname, "../node_modules");

config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../packages")];

config.resolver.nodeModulesPaths = [...config.resolver.nodeModulesPaths, mobileNodeModules, workspaceNodeModules];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(mobileNodeModules, "react"),
  "react-dom": path.resolve(mobileNodeModules, "react-dom"),
  "react-native": path.resolve(mobileNodeModules, "react-native"),
  "react-native-safe-area-context": path.resolve(
    mobileNodeModules,
    "react-native-safe-area-context",
  ),
  "react/jsx-runtime": path.resolve(mobileNodeModules, "react/jsx-runtime.js"),
  "react/jsx-dev-runtime": path.resolve(mobileNodeModules, "react/jsx-dev-runtime.js"),
  "@babel/runtime": path.resolve(mobileNodeModules, "@babel/runtime"),
};

module.exports = withNativeWind(config, { input: "./global.css" });

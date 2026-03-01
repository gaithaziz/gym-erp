const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "..");
const mobileNodeModules = path.resolve(__dirname, "node_modules");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

config.watchFolders = [
  path.resolve(__dirname, "../packages"),
  workspaceNodeModules,
];

config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  workspaceNodeModules,
];

config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(mobileNodeModules, "react"),
  "react-dom": path.resolve(mobileNodeModules, "react-dom"),
  "react-native": path.resolve(mobileNodeModules, "react-native"),
  "react/jsx-runtime": path.resolve(mobileNodeModules, "react/jsx-runtime.js"),
  "react/jsx-dev-runtime": path.resolve(mobileNodeModules, "react/jsx-dev-runtime.js"),
  "@babel/runtime": path.resolve(workspaceNodeModules, "@babel/runtime"),
};

module.exports = withNativeWind(config, { input: "./global.css" });

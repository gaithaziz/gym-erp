import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

function expectFile(relativePath) {
  const absolutePath = path.resolve(mobileRoot, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Expected file to exist: ${relativePath}`);
  }
}

const appJsonPath = path.resolve(mobileRoot, "app.json");
const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
const expo = appJson.expo;

if (!expo || typeof expo !== "object") {
  fail("app.json must contain an expo config object");
}

for (const [key, expected] of [
  ["name", "Gym ERP Mobile"],
  ["slug", "gym-erp-mobile"],
  ["scheme", "gymerp"],
]) {
  if (expo[key] !== expected) {
    fail(`expo.${key} must be ${JSON.stringify(expected)}`);
  }
}

if (expo.experiments?.typedRoutes !== true) {
  fail("expo.experiments.typedRoutes must be enabled");
}

for (const assetPath of [
  expo.icon,
  expo.splash?.image,
  expo.android?.adaptiveIcon?.foregroundImage,
  expo.android?.adaptiveIcon?.backgroundImage,
  expo.android?.adaptiveIcon?.monochromeImage,
  expo.web?.favicon,
]) {
  if (typeof assetPath !== "string" || !assetPath.trim()) {
    fail("app.json contains a missing asset path");
  }
  expectFile(assetPath);
}

const pluginNames = new Set(
  (expo.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin)),
);

for (const pluginName of ["expo-router", "expo-secure-store", "expo-image-picker", "expo-camera"]) {
  if (!pluginNames.has(pluginName)) {
    fail(`Missing required Expo plugin: ${pluginName}`);
  }
}

for (const routePath of [
  "app/_layout.tsx",
  "app/(public)/login.tsx",
  "app/(authenticated)/_layout.tsx",
  "app/(authenticated)/subscription.tsx",
  "app/(authenticated)/(tabs)/_layout.tsx",
  "app/(authenticated)/(tabs)/index.tsx",
  "app/(authenticated)/(tabs)/profile.tsx",
  "app/(authenticated)/(tabs)/qr.tsx",
]) {
  expectFile(routePath);
}

for (const configPath of ["babel.config.js", "metro.config.js", "index.js"]) {
  expectFile(configPath);
}

console.log("Mobile config verification passed.");

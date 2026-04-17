import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "react-native": fileURLToPath(new URL("./src/test/react-native.ts", import.meta.url).href),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

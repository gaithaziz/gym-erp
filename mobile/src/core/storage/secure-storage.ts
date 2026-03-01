import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { SecureStorageDriver } from "@gym-erp/contracts";

function canUseBrowserStorage(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export const secureStorageDriver: SecureStorageDriver = {
  async getItem(key) {
    if (canUseBrowserStorage()) {
      return window.localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (canUseBrowserStorage()) {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key) {
    if (canUseBrowserStorage()) {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

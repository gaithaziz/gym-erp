import { Linking } from "react-native";

import type {
  DownloadableResource,
  FileOpenDriver,
  OpenSharedFileResult,
} from "@gym-erp/contracts";

function normalizeResource(resource: DownloadableResource | string): DownloadableResource {
  return typeof resource === "string" ? { url: resource } : resource;
}

export const fileOpenDriver: FileOpenDriver = {
  async open(resource): Promise<OpenSharedFileResult> {
    const normalized = normalizeResource(resource);
    const supported = await Linking.canOpenURL(normalized.url);

    if (!supported) {
      throw new Error(`Cannot open resource: ${normalized.url}`);
    }

    await Linking.openURL(normalized.url);

    return {
      handled: true,
      method: "open",
    };
  },
};

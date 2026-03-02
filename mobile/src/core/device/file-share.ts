import { Share } from "react-native";

import type {
  DownloadableResource,
  FileShareDriver,
  OpenSharedFileResult,
} from "@gym-erp/contracts";

function normalizeResource(resource: DownloadableResource | string): DownloadableResource {
  return typeof resource === "string" ? { url: resource } : resource;
}

export const fileShareDriver: FileShareDriver = {
  async share(resource): Promise<OpenSharedFileResult> {
    const normalized = normalizeResource(resource);
    await Share.share({
      title: normalized.filename ?? undefined,
      url: normalized.url,
      message: normalized.url,
    });

    return {
      handled: true,
      method: "share",
    };
  },
};

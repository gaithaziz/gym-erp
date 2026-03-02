import type { DownloadableResource, OpenSharedFileResult } from "@gym-erp/contracts";

import { fileOpenDriver } from "@/src/core/device/file-open";
import { fileShareDriver } from "@/src/core/device/file-share";

export async function openDownloadableResource(
  resource: DownloadableResource | string,
): Promise<OpenSharedFileResult> {
  return fileOpenDriver.open(resource);
}

export async function shareDownloadableResource(
  resource: DownloadableResource | string,
): Promise<OpenSharedFileResult> {
  return fileShareDriver.share(resource);
}

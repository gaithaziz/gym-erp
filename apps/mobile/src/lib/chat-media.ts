import type { PickedMedia } from "./media-picker";

import { API_BASE_URL } from "./api";

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function isImageMime(mimeType?: string | null) {
  return Boolean(mimeType?.toLowerCase().startsWith("image/"));
}

export function resolveMediaUri(uri?: string | null) {
  if (!uri) {
    return null;
  }
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("file://") || uri.startsWith("content://")
    ? uri
    : `${ASSET_BASE_URL}${uri}`;
}

export type ChatAttachmentSelection =
  | {
      kind: "photo-preview";
      asset: PickedMedia;
      caption: string;
    }
  | {
      kind: "upload";
      asset: PickedMedia;
      caption: string;
    };

export function classifyChatAttachment(asset: PickedMedia, caption: string): ChatAttachmentSelection {
  if (isImageMime(asset.mimeType)) {
    return {
      kind: "photo-preview",
      asset,
      caption,
    };
  }

  return {
    kind: "upload",
    asset,
    caption,
  };
}

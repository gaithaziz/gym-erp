import { describe, expect, it } from "vitest";

import { classifyChatAttachment, isImageMime, resolveMediaUri } from "./chat-media";

describe("chat-media helpers", () => {
  it("classifies image attachments for preview before upload", () => {
    const result = classifyChatAttachment(
      {
        uri: "file:///tmp/photo.heic",
        name: "photo.heic",
        mimeType: "image/heic",
      },
      "Caption",
    );

    expect(result).toEqual({
      kind: "photo-preview",
      asset: {
        uri: "file:///tmp/photo.heic",
        name: "photo.heic",
        mimeType: "image/heic",
      },
      caption: "Caption",
    });
  });

  it("classifies non-image attachments for immediate upload", () => {
    const result = classifyChatAttachment(
      {
        uri: "file:///tmp/note.m4a",
        name: "note.m4a",
        mimeType: "audio/mp4",
      },
      "",
    );

    expect(result.kind).toBe("upload");
  });

  it("resolves relative asset uris against the api asset base", () => {
    expect(resolveMediaUri("/media/example.jpg")).toContain("/media/example.jpg");
  });

  it("detects image mime types", () => {
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("audio/mp4")).toBe(false);
  });
});

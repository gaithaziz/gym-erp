import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickImagesFromLibrary } from "./media-picker";

const { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync,
}));

describe("media picker", () => {
  beforeEach(() => {
    launchImageLibraryAsync.mockReset();
    requestMediaLibraryPermissionsAsync.mockReset();
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it("preserves heic images when picked", async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///tmp/photo.heic",
          fileName: "photo.heic",
          mimeType: "image/heic",
        },
      ],
    });
    const result = await pickImagesFromLibrary({ permissionDeniedMessage: "nope" });

    expect(result).toEqual([
      {
        uri: "file:///tmp/photo.heic",
        name: "photo.heic",
        mimeType: "image/heic",
      },
    ]);
  });

  it("passes through already supported image formats", async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///tmp/photo.png",
          fileName: "photo.png",
          mimeType: "image/png",
        },
      ],
    });

    const result = await pickImagesFromLibrary({ permissionDeniedMessage: "nope" });

    expect(result).toEqual([
      {
        uri: "file:///tmp/photo.png",
        name: "photo.png",
        mimeType: "image/png",
      },
    ]);
  });
});

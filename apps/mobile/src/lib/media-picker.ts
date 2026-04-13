import * as ImagePicker from "expo-image-picker";

export type PickedMedia = {
  uri: string;
  name: string;
  mimeType: string;
};

function extensionForMime(mimeType?: string | null) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/heic") {
    return "heic";
  }
  if (mimeType === "image/heif") {
    return "heif";
  }
  return "jpg";
}

export async function pickMediaFromLibrary(options: {
  multiple?: boolean;
  permissionDeniedMessage: string;
  mediaTypes?: ImagePicker.MediaTypeOptions;
}): Promise<PickedMedia[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(options.permissionDeniedMessage);
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: options.multiple ?? false,
    mediaTypes: options.mediaTypes ?? ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });

  if (result.canceled) {
    return [];
  }

  return result.assets.map((asset, index) => {
    const mimeType = asset.mimeType ?? "image/jpeg";
    return {
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}-${index}.${extensionForMime(mimeType)}`,
      mimeType,
    };
  });
}

export async function pickImagesFromLibrary(options: { multiple?: boolean; permissionDeniedMessage: string }): Promise<PickedMedia[]> {
  return pickMediaFromLibrary({ ...options, mediaTypes: ImagePicker.MediaTypeOptions.Images });
}

export async function pickImageOrVideoFromLibrary(options: { multiple?: boolean; permissionDeniedMessage: string }): Promise<PickedMedia[]> {
  return pickMediaFromLibrary({ ...options, mediaTypes: ImagePicker.MediaTypeOptions.All });
}

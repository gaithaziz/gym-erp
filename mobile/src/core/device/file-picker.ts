import * as ImagePicker from "expo-image-picker";

import type { FilePickerDriver, PickedFile } from "@gym-erp/contracts";

type PickedFileWithWebAsset = PickedFile & {
  webFile?: File | null;
};

export const filePickerDriver: FilePickerDriver = {
  async pickFile() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Media library permission is required.");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0] as typeof result.assets[0] & { file?: File | null };
    const pickedFile: PickedFileWithWebAsset = {
      uri: asset.uri,
      name: asset.fileName ?? `profile-${Date.now()}.jpg`,
      mimeType: asset.mimeType,
      size: asset.fileSize,
      webFile: asset.file ?? null,
    };

    return pickedFile;
  },
};

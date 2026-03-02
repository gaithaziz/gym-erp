import type { PickedFile, UploadFileInput } from "@gym-erp/contracts";

export function prepareUploadFile(file: PickedFile): UploadFileInput {
  return {
    uri: file.uri,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
  };
}

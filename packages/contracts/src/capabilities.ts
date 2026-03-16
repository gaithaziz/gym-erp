export type StoredSecret = string | null;

export interface SecureStorageDriver {
  getItem(key: string): Promise<StoredSecret>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface UploadFileInput {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

export interface FilePickerDriver {
  pickFile(): Promise<PickedFile | null>;
}

export interface DownloadableResource {
  url: string;
  filename?: string | null;
  mimeType?: string | null;
}

export interface OpenSharedFileResult {
  handled: boolean;
  method: "share" | "open" | "external";
}

export interface FileShareDriver {
  share(resource: DownloadableResource | string): Promise<OpenSharedFileResult>;
}

export interface FileOpenDriver {
  open(resource: DownloadableResource | string): Promise<OpenSharedFileResult>;
}

export type StoredSecret = string | null;

export interface SecureStorageDriver {
  getItem(key: string): Promise<StoredSecret>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface QrScannerDriver {
  scan(): Promise<string>;
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

export interface FileShareDriver {
  share(uri: string): Promise<void>;
}

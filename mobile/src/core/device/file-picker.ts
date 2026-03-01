import type { FilePickerDriver } from "@gym-erp/contracts";

export const filePickerDriver: FilePickerDriver = {
  async pickFile() {
    throw new Error("NotImplemented");
  },
};

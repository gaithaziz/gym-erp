import type { QrScannerDriver } from "@gym-erp/contracts";

export const qrScannerDriver: QrScannerDriver = {
  async scan() {
    throw new Error("NotImplemented");
  },
};

import type { FileShareDriver } from "@gym-erp/contracts";

export const fileShareDriver: FileShareDriver = {
  async share() {
    throw new Error("NotImplemented");
  },
};

/**
 * NetworkContext — provides the current online/offline state from useNetwork()
 * to the entire component tree without prop-drilling.
 *
 * Provided by NetworkProvider in _layout.tsx.
 */
import { createContext } from "react";

export type NetworkContextValue = {
  isOnline: boolean;
  isChecking: boolean;
};

export const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  isChecking: false,
});

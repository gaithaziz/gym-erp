/**
 * useOfflineGuard — returns props that can be spread onto any button or
 * pressable to disable it with a localized label when the device is offline.
 *
 * Usage:
 *   const { isOnline, guard } = useOfflineGuard();
 *   <PrimaryButton {...guard(copy.billing.submit)} onPress={...} />
 *
 * When offline the button will be disabled and its label replaced with the
 * offline message. When online the original label and enabled state are passed
 * through unchanged.
 */
import { useContext } from "react";

import { NetworkContext } from "@/lib/network-context";

export type OfflineGuardedProps = {
  disabled: boolean;
  children: string;
};

export function useOfflineGuard() {
  const { isOnline } = useContext(NetworkContext);

  function guard(label: string, extraDisabled = false): OfflineGuardedProps {
    if (!isOnline) {
      return { disabled: true, children: "No internet connection" };
    }
    return { disabled: extraDisabled, children: label };
  }

  return { isOnline, guard };
}

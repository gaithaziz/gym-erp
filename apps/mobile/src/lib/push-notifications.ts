import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushRegistration = {
  device_token: string;
  platform: string;
  device_name?: string | null;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function projectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.expoConfig?.extra?.projectId as string | undefined)
  );
}

function allowsNotifications(status: unknown) {
  const value = status as { granted?: boolean; status?: string; ios?: { status?: Notifications.IosAuthorizationStatus } };
  return value.granted === true || value.status === "granted" || value.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function getPushRegistration(): Promise<PushRegistration | null> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return null;
  }

  const current = await Notifications.getPermissionsAsync();
  let granted = allowsNotifications(current);
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = allowsNotifications(requested);
  }
  if (!granted) {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F97316",
    });
  }

  const resolvedProjectId = projectId();
  const token = resolvedProjectId
    ? (await Notifications.getExpoPushTokenAsync({ projectId: resolvedProjectId })).data
    : (await Notifications.getExpoPushTokenAsync()).data;

  return {
    device_token: token,
    platform: Platform.OS,
    device_name: Device.deviceName ?? Device.modelName ?? null,
  };
}

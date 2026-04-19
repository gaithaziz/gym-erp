import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SecondaryButton, SectionTitle, TextArea } from "@/components/ui";
import { API_BASE_URL, parseEnvelope, parseProfileEnvelope, type NotificationSettings } from "@/lib/api";
import { pickImagesFromLibrary } from "@/lib/media-picker";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function resolveMediaUri(uri?: string | null) {
  if (!uri) {
    return null;
  }
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("file://") || uri.startsWith("content://") ? uri : `${ASSET_BASE_URL}${uri}`;
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ProfileScreen() {
  const { authorizedRequest, refreshBootstrap, signOut } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["mobile-profile"],
    queryFn: async () => parseProfileEnvelope(await authorizedRequest("/mobile/me/profile")).data,
  });
  const notificationsQuery = useQuery({
    queryKey: ["mobile-notification-settings"],
    queryFn: async () => parseEnvelope<NotificationSettings>(await authorizedRequest("/mobile/me/notification-settings")).data,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }
    setFullName(profileQuery.data.full_name || "");
    setPhone(profileQuery.data.phone_number || "");
    setBio(profileQuery.data.bio || "");
  }, [profileQuery.data]);

  const profileMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/mobile/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          phone_number: phone.trim() || null,
          bio: bio.trim() || null,
        }),
      }),
    onSuccess: async () => {
      setFormMessage(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-profile"] });
      await refreshBootstrap();
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const passwordMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/mobile/me/profile/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setFormMessage(copy.common.successUpdated);
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const prefsMutation = useMutation({
    mutationFn: async (next: NotificationSettings) =>
      authorizedRequest("/mobile/me/notification-settings", {
        method: "PUT",
        body: JSON.stringify(next),
      }),
    onSuccess: async () => {
      setFormMessage(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-notification-settings"] });
      await refreshBootstrap();
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const testPushMutation = useMutation({
    mutationFn: async () => authorizedRequest("/mobile/devices/test-push", { method: "POST" }),
    onSuccess: () => setFormMessage(copy.common.successSent),
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => authorizedRequest("/mobile/me", { method: "DELETE" }),
    onSuccess: async () => {
      await signOut();
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  function confirmDeleteAccount() {
    Alert.alert(copy.common.deleteAccountConfirmTitle, copy.common.deleteAccountConfirmMessage, [
      { text: copy.common.cancel, style: "cancel" },
      { text: copy.common.deleteAccount, style: "destructive", onPress: () => deleteAccountMutation.mutate() },
    ]);
  }

  const photoMutation = useMutation({
    mutationFn: async () => {
      const [asset] = await pickImagesFromLibrary({ permissionDeniedMessage: copy.common.photoPermissionDenied });
      if (!asset) {
        return null;
      }
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType,
      } as never);
      return authorizedRequest("/mobile/me/profile/picture", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async (payload) => {
      if (!payload) {
        return;
      }
      setFormMessage(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-profile"] });
      await refreshBootstrap();
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  function togglePref(key: keyof NotificationSettings) {
    if (!notificationsQuery.data) {
      return;
    }
    void prefsMutation.mutate({
      ...notificationsQuery.data,
      [key]: !notificationsQuery.data[key],
    });
  }

  return (
    <Screen title={copy.common.profile} subtitle={copy.profileScreen.subtitle}>
      <QueryState loading={profileQuery.isLoading} error={profileQuery.error instanceof Error ? profileQuery.error.message : null} />
      {profileQuery.data ? (
        <>
          <Card style={[styles.profilePhotoCard, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.avatarFrame, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
              {resolveMediaUri(profileQuery.data.profile_picture_url) ? (
                <Image source={{ uri: resolveMediaUri(profileQuery.data.profile_picture_url) ?? undefined }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.avatarInitials, { color: "#FFFFFF", fontFamily: fontSet.display }]}>{getInitials(profileQuery.data.full_name, profileQuery.data.email)}</Text>
                </View>
              )}
            </View>
            <View style={styles.profilePhotoText}>
              <SectionTitle>{copy.profileScreen.profilePhoto}</SectionTitle>
              <MutedText>{profileQuery.data.profile_picture_url ? profileQuery.data.email : copy.profileScreen.noPhoto}</MutedText>
              <SecondaryButton onPress={() => photoMutation.mutate()} disabled={photoMutation.isPending}>
                {photoMutation.isPending ? copy.profileScreen.uploadingPhoto : copy.profileScreen.changePhoto}
              </SecondaryButton>
            </View>
          </Card>

          <Card>
            <SectionTitle>{profileQuery.data.full_name || copy.common.customer}</SectionTitle>
            <MutedText>{profileQuery.data.email}</MutedText>
          </Card>

          <Card>
            <SectionTitle>{copy.more.profile}</SectionTitle>
            <Input value={fullName} onChangeText={setFullName} placeholder={copy.profileScreen.fullName} />
            <Input value={phone} onChangeText={setPhone} placeholder={copy.profileScreen.phone} keyboardType="phone-pad" />
            <TextArea value={bio} onChangeText={setBio} placeholder={copy.profileScreen.bio} />
            <PrimaryButton onPress={() => profileMutation.mutate()} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? copy.profileScreen.savingProfile : copy.profileScreen.saveProfile}
            </PrimaryButton>
          </Card>

          <Card>
            <SectionTitle>{copy.profileScreen.changePassword}</SectionTitle>
            <Input value={currentPassword} onChangeText={setCurrentPassword} placeholder={copy.profileScreen.currentPassword} secureTextEntry />
            <Input value={newPassword} onChangeText={setNewPassword} placeholder={copy.profileScreen.newPassword} secureTextEntry />
            <PrimaryButton onPress={() => passwordMutation.mutate()} disabled={passwordMutation.isPending || !currentPassword || !newPassword}>
              {passwordMutation.isPending ? copy.profileScreen.changingPassword : copy.profileScreen.changePassword}
            </PrimaryButton>
          </Card>
        </>
      ) : null}

      <QueryState loading={notificationsQuery.isLoading} error={notificationsQuery.error instanceof Error ? notificationsQuery.error.message : null} />
      {notificationsQuery.data ? (
        <Card>
          <SectionTitle>{copy.profileScreen.notificationSettings}</SectionTitle>
          <PreferenceRow label={copy.profileScreen.push} enabled={notificationsQuery.data.push_enabled} onPress={() => togglePref("push_enabled")} />
          <PreferenceRow label={copy.profileScreen.chat} enabled={notificationsQuery.data.chat_enabled} onPress={() => togglePref("chat_enabled")} />
          <PreferenceRow label={copy.profileScreen.support} enabled={notificationsQuery.data.support_enabled} onPress={() => togglePref("support_enabled")} />
          <PreferenceRow label={copy.profileScreen.billing} enabled={notificationsQuery.data.billing_enabled} onPress={() => togglePref("billing_enabled")} />
          <PreferenceRow label={copy.profileScreen.announcements} enabled={notificationsQuery.data.announcements_enabled} onPress={() => togglePref("announcements_enabled")} />
          <View style={{ marginTop: 14 }}>
            <SecondaryButton onPress={() => testPushMutation.mutate()} disabled={testPushMutation.isPending}>
              {testPushMutation.isPending ? copy.common.sending : copy.profileScreen.testPush}
            </SecondaryButton>
          </View>
        </Card>
      ) : null}

      <Card style={{ borderColor: "#A53A22", borderWidth: 1, backgroundColor: theme.cardAlt, marginTop: 12 }}>
        <SectionTitle>{copy.common.deleteAccount}</SectionTitle>
        <MutedText>{copy.common.deleteAccountConfirmMessage}</MutedText>
        <PrimaryButton
          onPress={confirmDeleteAccount}
          disabled={deleteAccountMutation.isPending}
          style={{ marginTop: 12, backgroundColor: "#A53A22" }}
        >
          {deleteAccountMutation.isPending ? copy.common.sending : copy.common.deleteAccount}
        </PrimaryButton>
      </Card>

      {formMessage ? (
        <Card>
          <Text style={[styles.feedbackText, { color: theme.primary, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
            {formMessage}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function PreferenceRow({ label, enabled, onPress }: { label: string; enabled: boolean; onPress: () => void }) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable onPress={onPress} style={[styles.preferenceRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <View style={styles.preferenceText}>
        <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>{label}</Text>
      </View>
      <Text style={{ color: enabled ? theme.primary : theme.muted, fontFamily: fontSet.mono }}>{enabled ? copy.common.on : copy.common.off}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profilePhotoCard: {
    alignItems: "center",
    gap: 14,
  },
  avatarFrame: {
    width: 76,
    height: 76,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: "800",
  },
  profilePhotoText: {
    flex: 1,
    gap: 8,
  },
  preferenceRow: {
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  preferenceText: {
    flex: 1,
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 20,
  },
});

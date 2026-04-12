import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, TextArea } from "@/components/ui";
import { parseEnvelope, parseProfileEnvelope, type NotificationSettings } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function ProfileScreen() {
  const { authorizedRequest, refreshBootstrap } = useSession();
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
    queryFn: async () => parseProfileEnvelope(await authorizedRequest("/mobile/customer/profile")).data,
  });
  const notificationsQuery = useQuery({
    queryKey: ["mobile-notification-settings"],
    queryFn: async () => parseEnvelope<NotificationSettings>(await authorizedRequest("/mobile/customer/notification-settings")).data,
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
      authorizedRequest("/mobile/customer/profile", {
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
      authorizedRequest("/mobile/customer/profile/password", {
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
      authorizedRequest("/mobile/customer/notification-settings", {
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
        </Card>
      ) : null}

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

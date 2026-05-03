import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Card, Input, PrimaryButton, Screen, SectionTitle } from "@/components/ui";
import { parseStaffMemberRegistrationEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type Notice = { kind: "success" | "error"; message: string };

export default function MemberRegisterScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authorizedRequest } = useSession();
  const { copy } = usePreferences();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const registerMutation = useMutation({
    onMutate: () => setNotice(null),
    mutationFn: async () =>
      parseStaffMemberRegistrationEnvelope(
        await authorizedRequest("/mobile/staff/members/register", {
          method: "POST",
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim(),
            phone_number: phoneNumber.trim() || null,
            password,
          }),
        }),
      ).data,
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-staff-members"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-admin-people-summary"] });
      router.replace({ pathname: "/(tabs)/members", params: { memberId: payload.member.id } });
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
    },
  });

  return (
    <Screen title={copy.membersScreen.quickRegister} subtitle={copy.membersScreen.quickRegisterSubtitle}>
      <Card>
        <SectionTitle>{copy.membersScreen.newMember}</SectionTitle>
        <Input value={fullName} onChangeText={setFullName} placeholder={copy.membersScreen.fullName} accessibilityLabel={copy.membersScreen.fullName} />
        <Input value={email} onChangeText={setEmail} placeholder={copy.membersScreen.email} accessibilityLabel={copy.membersScreen.email} autoCapitalize="none" />
        <Input value={phoneNumber} onChangeText={setPhoneNumber} placeholder={copy.membersScreen.phoneNumber} accessibilityLabel={copy.membersScreen.phoneNumber} />
        <Input value={password} onChangeText={setPassword} placeholder={copy.membersScreen.temporaryPassword} accessibilityLabel={copy.membersScreen.temporaryPassword} secureTextEntry />
        {notice ? <InlineNotice notice={notice} /> : null}
        <PrimaryButton onPress={() => registerMutation.mutate()} disabled={registerMutation.isPending || !fullName.trim() || !email.trim() || password.length < 6}>
          {registerMutation.isPending ? copy.common.loading : copy.membersScreen.createMember}
        </PrimaryButton>
      </Card>
    </Screen>
  );
}

function InlineNotice({ notice }: { notice: Notice }) {
  const { fontSet, theme } = usePreferences();
  const isError = notice.kind === "error";
  const color = isError ? "#B42318" : theme.primary;
  return (
    <View style={{ borderWidth: 1, borderColor: color, backgroundColor: isError ? "#FEF3F2" : theme.primarySoft, borderRadius: 14, padding: 10 }}>
      <Text style={{ color, fontFamily: fontSet.body, fontWeight: "700" }}>{notice.message}</Text>
    </View>
  );
}

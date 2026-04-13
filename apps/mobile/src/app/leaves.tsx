import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, TextArea } from "@/components/ui";
import { parseEnvelope } from "@/lib/api";
import { localeTag } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type LeaveRequest = {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
  reason?: string | null;
};

const LEAVE_TYPES = ["ANNUAL", "SICK", "EMERGENCY", "UNPAID"] as const;

export default function LeavesScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const today = new Date().toISOString().slice(0, 10);
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>("ANNUAL");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const leavesQuery = useQuery({
    queryKey: ["mobile-leaves"],
    queryFn: async () => (await authorizedRequest<LeaveRequest[]>("/hr/leaves/me")).data,
  });

  const submitMutation = useMutation({
    mutationFn: async () =>
      parseEnvelope(await authorizedRequest("/hr/leaves", {
        method: "POST",
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() || null,
        }),
      })),
    onSuccess: async () => {
      setReason("");
      setMessage(copy.leavesScreen.submitted);
      await queryClient.invalidateQueries({ queryKey: ["mobile-leaves"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  return (
    <Screen title={copy.operationsScreen.myLeaves} subtitle={copy.leavesScreen.subtitle}>
      <Card>
        <SectionTitle>{copy.leavesScreen.requestLeave}</SectionTitle>
        <Input value={leaveType} onChangeText={(value) => setLeaveType((LEAVE_TYPES.includes(value as never) ? value : "ANNUAL") as (typeof LEAVE_TYPES)[number])} placeholder={copy.leavesScreen.leaveType} />
        <Input value={startDate} onChangeText={setStartDate} placeholder={copy.leavesScreen.startDate} />
        <Input value={endDate} onChangeText={setEndDate} placeholder={copy.leavesScreen.endDate} />
        <TextArea value={reason} onChangeText={setReason} placeholder={copy.leavesScreen.reason} />
        <PrimaryButton onPress={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? copy.leavesScreen.submitting : copy.leavesScreen.requestLeave}
        </PrimaryButton>
        {message ? <MutedText>{message}</MutedText> : null}
      </Card>

      <Card>
        <SectionTitle>{copy.leavesScreen.myLeaves}</SectionTitle>
        <QueryState
          loading={leavesQuery.isLoading}
          error={leavesQuery.error instanceof Error ? leavesQuery.error.message : null}
          empty={!leavesQuery.isLoading && (leavesQuery.data ?? []).length === 0}
          emptyMessage={copy.leavesScreen.noLeaves}
        />
        {(leavesQuery.data ?? []).map((leave) => (
          <View key={leave.id} style={{ borderTopWidth: 1, borderTopColor: theme.border, marginTop: 12, paddingTop: 12, gap: 4 }}>
            <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
              {leave.leave_type}
            </Text>
            <MutedText>{`${new Date(leave.start_date).toLocaleDateString(locale)} - ${new Date(leave.end_date).toLocaleDateString(locale)}`}</MutedText>
            <MutedText>{`${copy.common.status}: ${leave.status}`}</MutedText>
            {leave.reason ? <MutedText>{leave.reason}</MutedText> : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

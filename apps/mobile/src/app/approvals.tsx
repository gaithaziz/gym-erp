import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileLeaveApprovalItem, MobileRenewalApprovalItem } from "@gym-erp/contracts";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { parseAdminApprovalsEnvelope, parseApprovalActionResultEnvelope } from "@/lib/api";
import { localeTag, localizePaymentMethod } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;

export default function ApprovalsScreen() {
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const adminControl = isAdminControlRole(role);
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const [selectedRenewalId, setSelectedRenewalId] = useState<string | null>(null);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [reviewerNote, setReviewerNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const approvalsQuery = useQuery({
    queryKey: ["mobile-admin-approvals", role],
    enabled: adminControl,
    queryFn: async () => parseAdminApprovalsEnvelope(await authorizedRequest("/mobile/admin/approvals")).data,
  });

  async function invalidateOps() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-approvals"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-home"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-operations-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-finance-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-people-summary"] }),
    ]);
  }

  const approveRenewalMutation = useMutation({
    mutationFn: async (requestId: string) =>
      parseApprovalActionResultEnvelope(
        await authorizedRequest(`/mobile/admin/approvals/renewals/${requestId}/approve`, {
          method: "POST",
          body: JSON.stringify({
            amount_paid: Number(amountPaid),
            payment_method: paymentMethod,
            reviewer_note: reviewerNote.trim() || null,
          }),
        }),
      ).data,
    onSuccess: async () => {
      setFeedback(copy.common.successUpdated);
      setAmountPaid("");
      setReviewerNote("");
      setSelectedRenewalId(null);
      await invalidateOps();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const rejectRenewalMutation = useMutation({
    mutationFn: async (requestId: string) =>
      parseApprovalActionResultEnvelope(
        await authorizedRequest(`/mobile/admin/approvals/renewals/${requestId}/reject`, {
          method: "POST",
          body: JSON.stringify({ reviewer_note: reviewerNote.trim() || null }),
        }),
      ).data,
    onSuccess: async () => {
      setFeedback(copy.common.successUpdated);
      setReviewerNote("");
      setSelectedRenewalId(null);
      await invalidateOps();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const leaveMutation = useMutation({
    mutationFn: async ({ leaveId, status }: { leaveId: string; status: "APPROVED" | "DENIED" }) =>
      authorizedRequest(`/mobile/admin/approvals/leaves/${leaveId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      setFeedback(copy.common.successUpdated);
      setSelectedLeaveId(null);
      await invalidateOps();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  if (!adminControl) {
    return (
      <Screen title={copy.adminControl.approvalQueue} subtitle={copy.adminControl.subtitle} showSubtitle>
        <Card>
          <MutedText>{copy.common.noData}</MutedText>
        </Card>
      </Screen>
    );
  }

  const approvals = approvalsQuery.data;

  return (
    <Screen title={copy.adminControl.approvalQueue} subtitle={copy.adminControl.subtitle} showSubtitle>
      <QueryState loading={approvalsQuery.isLoading} error={approvalsQuery.error instanceof Error ? approvalsQuery.error.message : null} />
      {feedback ? (
        <Card>
          <MutedText>{feedback}</MutedText>
        </Card>
      ) : null}

      {approvals ? (
        <>
          <Card>
            <SectionTitle>{copy.adminControl.renewalRequests}</SectionTitle>
            {approvals.renewals.length === 0 ? <MutedText>{copy.adminControl.noApprovals}</MutedText> : null}
            {approvals.renewals.map((request) => {
              const selected = selectedRenewalId === request.id;
              return (
                <ApprovalRow key={request.id} active={selected} title={request.member_name || request.member_email} meta={`${request.plan_name} - ${request.duration_days} ${copy.common.days}`} onPress={() => setSelectedRenewalId(selected ? null : request.id)}>
                  {selected ? (
                    <RenewalDetail
                      request={request}
                      amountPaid={amountPaid}
                      setAmountPaid={setAmountPaid}
                      paymentMethod={paymentMethod}
                      setPaymentMethod={setPaymentMethod}
                      reviewerNote={reviewerNote}
                      setReviewerNote={setReviewerNote}
                      onApprove={() => approveRenewalMutation.mutate(request.id)}
                      onReject={() => rejectRenewalMutation.mutate(request.id)}
                      busy={approveRenewalMutation.isPending || rejectRenewalMutation.isPending}
                    />
                  ) : null}
                </ApprovalRow>
              );
            })}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.leaveRequests}</SectionTitle>
            {approvals.leaves.length === 0 ? <MutedText>{copy.adminControl.noApprovals}</MutedText> : null}
            {approvals.leaves.map((leave) => {
              const selected = selectedLeaveId === leave.id;
              return (
                <ApprovalRow key={leave.id} active={selected} title={leave.staff_name || leave.staff_email} meta={`${leaveTypeLabel(leave.leave_type, copy)} - ${leave.start_date} / ${leave.end_date}`} onPress={() => setSelectedLeaveId(selected ? null : leave.id)}>
                  {selected ? (
                    <LeaveDetail
                      leave={leave}
                      locale={locale}
                      onApprove={() => leaveMutation.mutate({ leaveId: leave.id, status: "APPROVED" })}
                      onDeny={() => leaveMutation.mutate({ leaveId: leave.id, status: "DENIED" })}
                      busy={leaveMutation.isPending}
                    />
                  ) : null}
                </ApprovalRow>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function ApprovalRow({ active, children, meta, onPress, title }: { active: boolean; children?: React.ReactNode; meta: string; onPress: () => void; title: string }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: active ? theme.cardAlt : "transparent", borderColor: active ? theme.primary : theme.border }]}>
      <View style={{ gap: 4 }}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{title}</Text>
        <MutedText>{meta}</MutedText>
      </View>
      {children}
    </Pressable>
  );
}

function RenewalDetail({
  amountPaid,
  busy,
  onApprove,
  onReject,
  paymentMethod,
  request,
  reviewerNote,
  setAmountPaid,
  setPaymentMethod,
  setReviewerNote,
}: {
  amountPaid: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  request: MobileRenewalApprovalItem;
  reviewerNote: string;
  setAmountPaid: (value: string) => void;
  setPaymentMethod: (value: (typeof PAYMENT_METHODS)[number]) => void;
  setReviewerNote: (value: string) => void;
}) {
  const { copy, isRTL, theme, fontSet } = usePreferences();
  return (
    <View style={styles.detail}>
      <MutedText>{`${copy.adminControl.customerNote}: ${request.customer_note || copy.common.noComment}`}</MutedText>
      <MutedText>{`${copy.adminControl.requestedAt}: ${request.requested_at || copy.common.noData}`}</MutedText>
      <Input value={amountPaid} onChangeText={setAmountPaid} placeholder={copy.adminControl.amountPaid} keyboardType="decimal-pad" />
      <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {PAYMENT_METHODS.map((method) => {
          const active = method === paymentMethod;
          return (
            <Pressable key={method} onPress={() => setPaymentMethod(method)} style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.cardAlt, borderColor: theme.border }]}>
              <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.mono }}>{localizePaymentMethod(method, isRTL)}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextArea value={reviewerNote} onChangeText={setReviewerNote} placeholder={copy.adminControl.reviewerNote} />
      <View style={[styles.actionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <PrimaryButton onPress={onApprove} disabled={busy || Number(amountPaid) <= 0}>{copy.adminControl.approve}</PrimaryButton>
        <SecondaryButton onPress={onReject} disabled={busy}>{copy.adminControl.reject}</SecondaryButton>
      </View>
    </View>
  );
}

function LeaveDetail({ busy, leave, locale, onApprove, onDeny }: { busy: boolean; leave: MobileLeaveApprovalItem; locale: string; onApprove: () => void; onDeny: () => void }) {
  const { copy, isRTL } = usePreferences();
  return (
    <View style={styles.detail}>
      <MutedText>{`${copy.adminControl.leaveType}: ${leaveTypeLabel(leave.leave_type, copy)}`}</MutedText>
      <MutedText>{`${copy.adminControl.startDate}: ${new Date(leave.start_date).toLocaleDateString(locale)}`}</MutedText>
      <MutedText>{`${copy.adminControl.endDate}: ${new Date(leave.end_date).toLocaleDateString(locale)}`}</MutedText>
      <MutedText>{`${copy.adminControl.reason}: ${leave.reason || copy.common.noComment}`}</MutedText>
      <View style={[styles.actionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <PrimaryButton onPress={onApprove} disabled={busy}>{copy.adminControl.approve}</PrimaryButton>
        <SecondaryButton onPress={onDeny} disabled={busy}>{copy.adminControl.deny}</SecondaryButton>
      </View>
    </View>
  );
}

function leaveTypeLabel(leaveType: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  const labels = copy.adminControl.leaveTypes as Record<string, string>;
  return labels[leaveType] ?? leaveType;
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: 8,
    gap: 12,
    padding: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
  },
  detail: {
    gap: 10,
  },
  chipRow: {
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionRow: {
    flexWrap: "wrap",
    gap: 10,
  },
});

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { parseBillingEnvelope } from "@/lib/api";
import { localeTag, localizePaymentMethod, localizeRenewalStatus, localizeSubscriptionStatus } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function BillingScreen() {
  const router = useRouter();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [selectedOfferCode, setSelectedOfferCode] = useState<string | null>(null);
  const [selectedDurationDays, setSelectedDurationDays] = useState<number | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);

  const billingQuery = useQuery({
    queryKey: ["mobile-billing"],
    queryFn: async () => parseBillingEnvelope(await authorizedRequest("/mobile/customer/billing")).data,
  });
  const billing = billingQuery.data;
  const locale = localeTag(isRTL);
  const subscription = billing?.subscription ?? bootstrap?.subscription;
  const subscriptionStatus = subscription?.status ?? "NONE";
  const statusMeta = getSubscriptionStatusMeta(subscriptionStatus, copy.billingScreen);
  const expiryDate = subscription?.end_date ? new Date(subscription.end_date) : null;
  const expiryLabel = expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) : copy.billingScreen.noExpirySet;

  const renewalMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfferCode || !selectedDurationDays) {
        throw new Error(copy.billingScreen.selectedOffer);
      }
      return authorizedRequest("/mobile/customer/billing/renewal-requests", {
        method: "POST",
        body: JSON.stringify({
          offer_code: selectedOfferCode,
          duration_days: selectedDurationDays,
          customer_note: customerNote.trim() || null,
        }),
      });
    },
    onSuccess: async () => {
      setCustomerNote("");
      setRequestError(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile-billing"] });
    },
    onError: (error) => {
      setRequestError(error instanceof Error ? error.message : copy.common.errorTryAgain);
    },
  });

  return (
    <Screen title={copy.common.billing} subtitle={copy.billingScreen.subtitle}>
      <QueryState loading={billingQuery.isLoading} error={billingQuery.error instanceof Error ? billingQuery.error.message : null} />
      {billing ? (
        <>
          <Card>
            <SectionTitle>{copy.billingScreen.currentPlan}</SectionTitle>
            <View style={[styles.subscriptionHero, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <View style={[styles.rowSpread, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.subscriptionText}>
                  <Text style={[styles.subscriptionPlan, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                    {subscription?.plan_name || copy.common.noActivePlan}
                  </Text>
                  <MutedText>{statusMeta.description}</MutedText>
                </View>
                <Text style={[styles.statusPill, { color: theme.primary, borderColor: theme.primary, fontFamily: fontSet.mono, textTransform: isRTL ? "none" : "uppercase" }]}>
                  {localizeSubscriptionStatus(subscriptionStatus, isRTL)}
                </Text>
              </View>
              <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <InlineSubStat label={copy.common.status} value={statusMeta.title} />
                <InlineSubStat label={copy.billingScreen.expiryDate} value={expiryLabel} />
              </View>
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.billingScreen.subscriptionRequests}</SectionTitle>
            <View style={[styles.actionGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {subscriptionStatus === "ACTIVE" ? (
                <>
                  <PrimaryButton onPress={() => selectFirstOffer()}>{copy.billingScreen.requestRenewal}</PrimaryButton>
                  <SecondaryButton onPress={() => openSubscriptionSupport("freeze")}>{copy.billingScreen.requestFreeze}</SecondaryButton>
                </>
              ) : null}
              {subscriptionStatus === "FROZEN" ? (
                <>
                  <PrimaryButton onPress={() => openSubscriptionSupport("unfreeze")}>{copy.billingScreen.requestUnfreeze}</PrimaryButton>
                  <SecondaryButton onPress={() => openSubscriptionSupport("support")}>{copy.billingScreen.contactSupport}</SecondaryButton>
                </>
              ) : null}
              {subscriptionStatus === "EXPIRED" ? (
                <>
                  <PrimaryButton onPress={() => selectFirstOffer()}>{copy.billingScreen.requestRenewal}</PrimaryButton>
                  <SecondaryButton onPress={() => openSubscriptionSupport("extend")}>{copy.billingScreen.requestExtension}</SecondaryButton>
                </>
              ) : null}
              {subscriptionStatus === "NONE" ? (
                <>
                  <PrimaryButton onPress={() => openSubscriptionSupport("extend")}>{copy.billingScreen.requestActivationExtend}</PrimaryButton>
                  <SecondaryButton onPress={() => openSubscriptionSupport("support")}>{copy.billingScreen.contactSupport}</SecondaryButton>
                </>
              ) : null}
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.billingScreen.requestTitle}</SectionTitle>
            <MutedText>{copy.billingScreen.requestHelp}</MutedText>
            <View style={styles.offerList}>
              {billing.renewal_offers.map((offer) => {
                const isSelected = selectedOfferCode === offer.code;
                return (
                  <Pressable
                    key={offer.code}
                    onPress={() => {
                      setSelectedOfferCode(offer.code);
                      setSelectedDurationDays(offer.duration_days);
                    }}
                    style={[
                      styles.offerCard,
                      {
                        backgroundColor: isSelected ? theme.primarySoft : theme.cardAlt,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.offerHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Text
                        style={[
                          styles.offerTitle,
                          {
                            color: isSelected ? theme.primary : theme.foreground,
                            fontFamily: fontSet.body,
                            textAlign: isRTL ? "right" : "left",
                            writingDirection: direction,
                          },
                        ]}
                      >
                        {offer.title}
                      </Text>
                      <Text style={[styles.offerDuration, { color: theme.primary, fontFamily: fontSet.mono }]}>{offer.duration_days} {copy.common.days}</Text>
                    </View>
                    <MutedText>{offer.description}</MutedText>
                  </Pressable>
                );
              })}
            </View>
            <Card style={[styles.selectionCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <MutedText>{copy.billingScreen.selectedOffer}</MutedText>
              <Text style={[styles.selectionValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                {selectedOfferCode || "--"}
              </Text>
            </Card>
            <TextArea
              value={customerNote}
              onChangeText={setCustomerNote}
              placeholder={copy.billingScreen.customerNotePlaceholder}
            />
            {requestError ? <Text style={styles.errorText}>{requestError}</Text> : null}
            <PrimaryButton onPress={() => renewalMutation.mutate()} disabled={renewalMutation.isPending}>
              {renewalMutation.isPending ? copy.billingScreen.submittingRequest : copy.billingScreen.submitRequest}
            </PrimaryButton>
          </Card>

          <Card>
            <SectionTitle>{copy.billingScreen.renewalRequests}</SectionTitle>
            {billing.renewal_requests.length === 0 ? (
              <MutedText>{copy.billingScreen.noRenewalRequests}</MutedText>
            ) : (
              billing.renewal_requests.map((request) => (
                <View key={request.id} style={[styles.stackRow, { borderTopColor: theme.border }]}>
                  <View style={[styles.rowSpread, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.itemTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {request.plan_name}
                    </Text>
                    <Text style={[styles.statusChip, { color: theme.primary, fontFamily: fontSet.mono, textTransform: isRTL ? "none" : "uppercase" }]}>
                      {localizeRenewalStatus(request.status, isRTL)}
                    </Text>
                  </View>
                  <MutedText>{localizePaymentMethod(request.payment_method, isRTL)}</MutedText>
                  {request.customer_note ? <MutedText>{request.customer_note}</MutedText> : null}
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.billingScreen.receipts}</SectionTitle>
            {billing.receipts.length === 0 ? (
              <MutedText>{copy.home.noReceipts}</MutedText>
            ) : (
              billing.receipts.map((receipt) => (
                <View key={receipt.id} style={[styles.stackRow, { borderTopColor: theme.border }]}>
                  <View style={[styles.rowSpread, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.itemTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {receipt.description}
                    </Text>
                    <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{receipt.amount}</Text>
                  </View>
                  <MutedText>{new Date(receipt.date).toLocaleDateString(locale)}</MutedText>
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.billingScreen.paymentPolicy}</SectionTitle>
            <Card style={[styles.policyCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <MutedText>{billing.payment_policy.notes}</MutedText>
            </Card>
          </Card>
        </>
      ) : null}
    </Screen>
  );

  function selectFirstOffer() {
    const firstOffer = billing?.renewal_offers[0];
    if (!firstOffer) {
      setRequestError(copy.billingScreen.selectedOffer);
      return;
    }
    setSelectedOfferCode(firstOffer.code);
    setSelectedDurationDays(firstOffer.duration_days);
  }

  function openSubscriptionSupport(type: string) {
    router.push({ pathname: "/support", params: { type } });
  }
}

function getSubscriptionStatusMeta(status: string, copy: {
  activeTitle: string;
  activeDesc: string;
  frozenTitle: string;
  frozenDesc: string;
  expiredTitle: string;
  expiredDesc: string;
  noneTitle: string;
  noneDesc: string;
}) {
  if (status === "ACTIVE") {
    return { title: copy.activeTitle, description: copy.activeDesc };
  }
  if (status === "FROZEN") {
    return { title: copy.frozenTitle, description: copy.frozenDesc };
  }
  if (status === "EXPIRED") {
    return { title: copy.expiredTitle, description: copy.expiredDesc };
  }
  return { title: copy.noneTitle, description: copy.noneDesc };
}

function InlineSubStat({ label, value }: { label: string; value: string }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.inlineSubStat, { borderColor: theme.border }]}>
      <Text
        style={[
          styles.inlineSubStatLabel,
          {
            color: theme.muted,
            fontFamily: fontSet.mono,
            textAlign: isRTL ? "right" : "left",
            writingDirection: direction,
            textTransform: isRTL ? "none" : "uppercase",
          },
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.inlineSubStatValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  subscriptionHero: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  subscriptionText: {
    flex: 1,
    gap: 4,
  },
  subscriptionPlan: {
    fontSize: 20,
    fontWeight: "800",
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 10,
    fontWeight: "900",
  },
  statGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  inlineSubStat: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  inlineSubStatLabel: {
    fontSize: 10,
    fontWeight: "800",
  },
  inlineSubStatValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  actionGrid: {
    gap: 10,
    flexWrap: "wrap",
  },
  offerList: {
    gap: 10,
  },
  offerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  offerHeader: {
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  offerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  offerDuration: {
    fontSize: 12,
    fontWeight: "800",
  },
  selectionCard: {
    gap: 2,
    paddingVertical: 12,
  },
  selectionValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  stackRow: {
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  rowSpread: {
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  statusChip: {
    fontSize: 11,
    fontWeight: "800",
  },
  amountText: {
    fontSize: 13,
    fontWeight: "800",
  },
  policyCard: {
    paddingVertical: 12,
  },
  errorText: {
    color: "#A53A22",
    fontSize: 14,
    lineHeight: 20,
  },
});

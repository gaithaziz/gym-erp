import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parsePosSummaryEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type Product = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  category: string;
};

export default function FinanceTab() {
  const { authorizedRequest } = useSession();
  const { copy, fontSet, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["mobile-pos-summary"],
    queryFn: async () => parsePosSummaryEnvelope(await authorizedRequest("/mobile/staff/finance/summary")).data,
  });

  const productsQuery = useQuery({
    queryKey: ["mobile-products"],
    queryFn: async () => (await authorizedRequest<Product[]>("/inventory/products")).data,
  });

  const sellMutation = useMutation({
    mutationFn: async (productId: string) =>
      authorizedRequest("/inventory/pos/sell", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          quantity: 1,
          payment_method: "CASH",
          member_id: memberId.trim() || null,
          idempotency_key: `${productId}:${Date.now()}`,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-pos-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-products"] });
    },
  });

  const summary = summaryQuery.data;
  const products = productsQuery.data ?? [];

  return (
    <Screen title={copy.financeScreen.title} subtitle={copy.financeScreen.subtitle}>
      <QueryState loading={summaryQuery.isLoading} error={summaryQuery.error instanceof Error ? summaryQuery.error.message : null} />
      {summary ? (
        <Card>
          <SectionTitle>{copy.financeScreen.todaySales}</SectionTitle>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.display }}>{summary.today_sales_total}</Text>
          <MutedText>{summary.today_sales_count}</MutedText>
          <MutedText>{`${copy.financeScreen.lowStock}: ${summary.low_stock_count}`}</MutedText>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{copy.financeScreen.products}</SectionTitle>
        <Input value={memberId} onChangeText={setMemberId} placeholder={copy.financeScreen.memberId} />
        <QueryState
          loading={productsQuery.isLoading}
          error={productsQuery.error instanceof Error ? productsQuery.error.message : null}
          empty={!productsQuery.isLoading && products.length === 0}
          emptyMessage={copy.financeScreen.noProducts}
        />
        {products.map((product) => (
          <View key={product.id} style={[styles.row, { borderTopColor: theme.border }]}>
            <View style={styles.textColumn}>
              <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{product.name}</Text>
              <MutedText>{`${product.category} • ${product.stock_quantity}`}</MutedText>
            </View>
            <PrimaryButton onPress={() => sellMutation.mutate(product.id)} disabled={sellMutation.isPending || product.stock_quantity < 1}>
              {copy.financeScreen.sell}
            </PrimaryButton>
          </View>
        ))}
      </Card>

      {summary ? (
        <Card>
          <SectionTitle>{copy.financeScreen.recentTransactions}</SectionTitle>
          {summary.recent_transactions.map((item) => (
            <View key={item.id} style={[styles.row, { borderTopColor: theme.border }]}>
              <View style={styles.textColumn}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{item.description}</Text>
                <MutedText>{item.member_name || item.payment_method}</MutedText>
              </View>
              <Text style={{ color: theme.primary, fontFamily: fontSet.mono }}>{item.amount}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
    gap: 12,
  },
  textColumn: {
    gap: 4,
  },
});

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SecondaryButton, SectionTitle } from "@/components/ui";
import { parseEnvelope, parsePosCheckoutEnvelope, parsePosSummaryEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type Product = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  category: string;
};

type CartLine = {
  product: Product;
  quantity: number;
};

type ReceiptDetail = {
  receipt_no: string;
  date: string;
  amount: number;
  payment_method: string;
  description: string;
  billed_to: string;
  line_items?: Array<{
    product_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>;
};

const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;

export default function FinanceTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, locale, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["mobile-pos-summary"],
    queryFn: async () => parsePosSummaryEnvelope(await authorizedRequest("/mobile/staff/finance/summary")).data,
  });

  const productsQuery = useQuery({
    queryKey: ["mobile-products", search.trim()],
    queryFn: async () => {
      const suffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      return (await authorizedRequest<Product[]>(`/inventory/products${suffix}`)).data;
    },
  });

  const receiptQuery = useQuery({
    queryKey: ["mobile-pos-receipt", selectedReceiptId],
    enabled: Boolean(selectedReceiptId),
    queryFn: async () => parseEnvelope<ReceiptDetail>(await authorizedRequest(`/finance/transactions/${selectedReceiptId}/receipt`)).data,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () =>
      parsePosCheckoutEnvelope(
        await authorizedRequest("/mobile/staff/pos/checkout", {
          method: "POST",
          body: JSON.stringify({
            items: Object.values(cart).map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
            payment_method: paymentMethod,
            member_id: memberId.trim() || null,
            idempotency_key: `mobile-pos:${Date.now()}:${Object.keys(cart).join(",")}`,
          }),
        }),
      ).data,
    onSuccess: async (result) => {
      setCart({});
      setLastReceiptId(result.transaction_id);
      setSelectedReceiptId(result.transaction_id);
      await queryClient.invalidateQueries({ queryKey: ["mobile-pos-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-products"] });
    },
    onError: (error) => {
      Alert.alert(copy.common.errorTryAgain, error instanceof Error ? error.message : copy.common.errorTryAgain);
    },
  });

  const products = productsQuery.data ?? [];
  const cartLines = Object.values(cart);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const summary = summaryQuery.data;
  const receipt = receiptQuery.data;

  function setLine(product: Product, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity < 1) {
        delete next[product.id];
      } else {
        next[product.id] = { product, quantity: Math.min(quantity, product.stock_quantity) };
      }
      return next;
    });
  }

  async function shareReceipt() {
    if (!receipt) {
      return;
    }
    const lines = [
      `${copy.billingScreen.receipts} #${receipt.receipt_no}`,
      `${copy.financeScreen.total}: ${formatMoney(receipt.amount, locale)}`,
      `${copy.financeScreen.paymentMethod}: ${receipt.payment_method}`,
      ...(receipt.line_items ?? []).map((item) => `${item.quantity}x ${item.product_name} - ${formatMoney(item.line_total, locale)}`),
    ];
    await Share.share({ message: lines.join("\n") });
  }

  return (
    <Screen title={copy.financeScreen.title} subtitle={copy.financeScreen.subtitle}>
      <QueryState loading={summaryQuery.isLoading} error={summaryQuery.error instanceof Error ? summaryQuery.error.message : null} />
      {summary ? (
        <Card>
          <SectionTitle>{copy.financeScreen.todaySales}</SectionTitle>
          <View style={[styles.statRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Metric label={copy.financeScreen.total} value={formatMoney(summary.today_sales_total, locale)} />
            <Metric label={copy.financeScreen.recentTransactions} value={summary.today_sales_count} />
            <Metric label={copy.financeScreen.lowStock} value={summary.low_stock_count} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{copy.financeScreen.products}</SectionTitle>
        <Input value={search} onChangeText={setSearch} placeholder={copy.financeScreen.searchProducts} />
        <QueryState
          loading={productsQuery.isLoading}
          error={productsQuery.error instanceof Error ? productsQuery.error.message : null}
          empty={!productsQuery.isLoading && products.length === 0}
          emptyMessage={copy.financeScreen.noProducts}
        />
        {products.map((product) => {
          const quantity = cart[product.id]?.quantity ?? 0;
          return (
            <View key={product.id} style={[styles.productRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.textColumn}>
                <Text style={[styles.titleText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                  {product.name}
                </Text>
                <MutedText>{`${product.category} - ${formatMoney(product.price, locale)} - ${copy.financeScreen.stock}: ${product.stock_quantity}`}</MutedText>
              </View>
              <View style={[styles.qtyControls, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <QtyButton label="-" disabled={quantity < 1} onPress={() => setLine(product, quantity - 1)} />
                <Text style={[styles.qtyText, { color: theme.foreground, fontFamily: fontSet.mono }]}>{quantity}</Text>
                <QtyButton label="+" disabled={quantity >= product.stock_quantity || product.stock_quantity < 1} onPress={() => setLine(product, quantity + 1)} />
              </View>
            </View>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>{copy.financeScreen.cart}</SectionTitle>
        {cartLines.length === 0 ? <MutedText>{copy.financeScreen.emptyCart}</MutedText> : null}
        {cartLines.map((line) => (
          <View key={line.product.id} style={[styles.rowBetween, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.textColumn}>
              <Text style={[styles.titleText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{line.product.name}</Text>
              <MutedText>{`${line.quantity} x ${formatMoney(line.product.price, locale)}`}</MutedText>
            </View>
            <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{formatMoney(line.product.price * line.quantity, locale)}</Text>
          </View>
        ))}
        <Input value={memberId} onChangeText={setMemberId} placeholder={copy.financeScreen.memberId} autoCapitalize="none" />
        <View style={[styles.paymentRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {PAYMENT_METHODS.map((method) => (
            <Pressable
              key={method}
              onPress={() => setPaymentMethod(method)}
              style={[styles.paymentChip, { backgroundColor: paymentMethod === method ? theme.primary : theme.cardAlt, borderColor: theme.border }]}
            >
              <Text style={{ color: paymentMethod === method ? "#FFFFFF" : theme.foreground, fontFamily: fontSet.body }}>{method}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.totalRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.totalLabel, { color: theme.foreground, fontFamily: fontSet.display }]}>{`${copy.financeScreen.total} (${cartCount})`}</Text>
          <Text style={[styles.totalValue, { color: theme.primary, fontFamily: fontSet.mono }]}>{formatMoney(cartTotal, locale)}</Text>
        </View>
        <PrimaryButton disabled={cartLines.length === 0 || checkoutMutation.isPending} onPress={() => checkoutMutation.mutate()}>
          {checkoutMutation.isPending ? copy.common.loading : copy.financeScreen.checkout}
        </PrimaryButton>
      </Card>

      {lastReceiptId ? (
        <Card>
          <SectionTitle>{copy.financeScreen.lastReceipt}</SectionTitle>
          <MutedText>{lastReceiptId}</MutedText>
          <SecondaryButton onPress={() => setSelectedReceiptId(lastReceiptId)}>{copy.financeScreen.viewReceipt}</SecondaryButton>
        </Card>
      ) : null}

      {selectedReceiptId ? (
        <Card>
          <SectionTitle>{copy.financeScreen.receiptDetail}</SectionTitle>
          <QueryState loading={receiptQuery.isLoading} error={receiptQuery.error instanceof Error ? receiptQuery.error.message : null} />
          {receipt ? (
            <>
              <MutedText>{`${copy.financeScreen.receiptNo}: ${receipt.receipt_no}`}</MutedText>
              <MutedText>{`${copy.financeScreen.billedTo}: ${receipt.billed_to}`}</MutedText>
              {(receipt.line_items ?? []).map((item) => (
                <View key={`${item.product_name}-${item.quantity}`} style={[styles.rowBetween, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <MutedText>{`${item.quantity}x ${item.product_name}`}</MutedText>
                  <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{formatMoney(item.line_total, locale)}</Text>
                </View>
              ))}
              <SecondaryButton onPress={() => void shareReceipt()}>{copy.financeScreen.shareReceipt}</SecondaryButton>
            </>
          ) : null}
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <SectionTitle>{copy.financeScreen.recentTransactions}</SectionTitle>
          {summary.recent_transactions.map((item) => (
            <Pressable key={item.id} onPress={() => setSelectedReceiptId(item.id)} style={[styles.rowBetween, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.textColumn}>
                <Text style={[styles.titleText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{item.description}</Text>
                <MutedText>{item.member_name || item.payment_method}</MutedText>
              </View>
              <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{formatMoney(item.amount, locale)}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  const { fontSet, theme } = usePreferences();
  return (
    <View style={[styles.metric, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: fontSet.mono }]}>{value}</Text>
      <MutedText>{label}</MutedText>
    </View>
  );
}

function QtyButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.qtyButton, { backgroundColor: disabled ? theme.card : theme.primarySoft, borderColor: theme.border, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={[styles.qtyButtonText, { color: theme.primary, fontFamily: fontSet.display }]}>{label}</Text>
    </Pressable>
  );
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  statRow: {
    gap: 10,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    minHeight: 76,
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 18,
    marginBottom: 4,
  },
  productRow: {
    alignItems: "center",
    borderTopWidth: 1,
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
  },
  rowBetween: {
    alignItems: "center",
    borderTopWidth: 1,
    gap: 12,
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "700",
  },
  qtyControls: {
    alignItems: "center",
    gap: 8,
  },
  qtyButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  qtyButtonText: {
    fontSize: 18,
  },
  qtyText: {
    minWidth: 22,
    textAlign: "center",
  },
  paymentRow: {
    flexWrap: "wrap",
    gap: 8,
  },
  paymentChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  totalRow: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 18,
  },
  totalValue: {
    fontSize: 20,
  },
  amountText: {
    fontSize: 14,
  },
});

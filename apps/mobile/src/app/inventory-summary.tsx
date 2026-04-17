import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseAdminInventorySummaryEnvelope } from "@/lib/api";
import { getCurrentRole, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function InventorySummaryScreen() {
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const adminControl = isAdminControlRole(role);

  const inventoryQuery = useQuery({
    queryKey: ["mobile-admin-inventory-summary", role],
    enabled: adminControl,
    queryFn: async () => parseAdminInventorySummaryEnvelope(await authorizedRequest("/mobile/admin/inventory/summary")).data,
  });

  if (!adminControl) {
    return (
      <Screen title={copy.adminControl.inventorySummary} subtitle={copy.adminControl.subtitle} showSubtitle>
        <Card>
          <MutedText>{copy.common.noData}</MutedText>
        </Card>
      </Screen>
    );
  }

  const inventory = inventoryQuery.data;

  return (
    <Screen title={copy.adminControl.inventorySummary} subtitle={copy.adminControl.subtitle} showSubtitle>
      <QueryState loading={inventoryQuery.isLoading} error={inventoryQuery.error instanceof Error ? inventoryQuery.error.message : null} />
      {inventory ? (
        <>
          <Card>
            <SectionTitle>{copy.adminControl.inventory}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.activeSkus} value={inventory.total_active_products} />
              <InlineStat label={copy.adminControl.lowStock} value={inventory.low_stock_count} />
              <InlineStat label={copy.adminControl.outOfStock} value={inventory.out_of_stock_count} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.lowStock}</SectionTitle>
            {inventory.low_stock_products.length === 0 ? <MutedText>{copy.adminControl.stockClear}</MutedText> : null}
            {inventory.low_stock_products.map((product) => (
              <View key={product.id} style={[styles.productRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.textColumn}>
                  <Text style={[styles.title, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                    {product.name}
                  </Text>
                  <MutedText>{[product.sku, product.category, `${copy.adminControl.threshold} ${product.low_stock_threshold}`].filter(Boolean).join(" - ")}</MutedText>
                </View>
                <Text style={[styles.stock, { color: theme.primary, fontFamily: fontSet.mono }]}>{product.stock_quantity}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  productRow: {
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
  title: {
    fontSize: 15,
    fontWeight: "800",
  },
  stock: {
    fontSize: 16,
    fontWeight: "800",
  },
});

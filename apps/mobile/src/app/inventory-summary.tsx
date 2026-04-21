import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileInventoryProduct } from "@gym-erp/contracts";

import { Card, InlineStat, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton } from "@/components/ui";
import { parseAdminInventorySummaryEnvelope, parseInventoryProductEnvelope, parseInventoryProductsEnvelope } from "@/lib/api";
import { getCurrentRole, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const CATEGORIES = ["SUPPLEMENT", "DRINK", "MERCHANDISE", "SNACK", "OTHER"] as const;
const STATUS_FILTERS = ["active", "inactive", "all"] as const;

type ProductForm = {
  name: string;
  sku: string;
  category: (typeof CATEGORIES)[number];
  price: string;
  cost_price: string;
  stock_quantity: string;
  low_stock_threshold: string;
  low_stock_restock_target: string;
  image_url: string;
  is_active: boolean;
};

const EMPTY_FORM: ProductForm = {
  name: "",
  sku: "",
  category: "OTHER",
  price: "",
  cost_price: "",
  stock_quantity: "0",
  low_stock_threshold: "5",
  low_stock_restock_target: "",
  image_url: "",
  is_active: true,
};

export default function InventorySummaryScreen() {
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const adminControl = isAdminControlRole(role);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | (typeof CATEGORIES)[number]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [snoozeHours, setSnoozeHours] = useState("24");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ["mobile-admin-inventory-summary", role],
    enabled: adminControl,
    queryFn: async () => parseAdminInventorySummaryEnvelope(await authorizedRequest("/mobile/admin/inventory/summary")).data,
  });

  const productQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status_filter", statusFilter);
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (categoryFilter !== "ALL") {
      params.set("category", categoryFilter);
    }
    return params.toString();
  }, [categoryFilter, search, statusFilter]);

  const productsQuery = useQuery({
    queryKey: ["mobile-admin-inventory-products", productQueryString, role],
    enabled: adminControl,
    queryFn: async () => parseInventoryProductsEnvelope(await authorizedRequest(`/mobile/admin/inventory/products?${productQueryString}`)).data,
  });

  async function invalidateInventory() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-inventory-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-inventory-products"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-operations-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-home"] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form);
      const endpoint = selectedId ? `/mobile/admin/inventory/products/${selectedId}` : "/mobile/admin/inventory/products";
      return parseInventoryProductEnvelope(
        await authorizedRequest(endpoint, {
          method: selectedId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }),
      ).data;
    },
    onSuccess: async (product) => {
      setFeedback(copy.adminControl.productSaved);
      setSelectedId(product.id);
      setForm(productToForm(product));
      await invalidateInventory();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (productId: string) =>
      parseInventoryProductEnvelope(
        await authorizedRequest(`/mobile/admin/inventory/products/${productId}`, {
          method: "DELETE",
        }),
      ).data,
    onSuccess: async () => {
      setFeedback(copy.adminControl.productDeactivated);
      setSelectedId(null);
      setForm(EMPTY_FORM);
      await invalidateInventory();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const lowStockMutation = useMutation({
    mutationFn: async ({ action, productId }: { action: "ack" | "snooze" | "target"; productId: string }) => {
      if (action === "ack") {
        return parseInventoryProductEnvelope(await authorizedRequest(`/mobile/admin/inventory/products/${productId}/low-stock/ack`, { method: "POST" })).data;
      }
      if (action === "snooze") {
        return parseInventoryProductEnvelope(
          await authorizedRequest(`/mobile/admin/inventory/products/${productId}/low-stock/snooze`, {
            method: "POST",
            body: JSON.stringify({ hours: Number(snoozeHours) || 24 }),
          }),
        ).data;
      }
      return parseInventoryProductEnvelope(
        await authorizedRequest(`/mobile/admin/inventory/products/${productId}/low-stock-target`, {
          method: "PUT",
          body: JSON.stringify({ target_quantity: Number(targetQuantity) || 0 }),
        }),
      ).data;
    },
    onSuccess: async (product) => {
      setFeedback(copy.common.successUpdated);
      setForm(productToForm(product));
      await invalidateInventory();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
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
  const products = productsQuery.data?.items ?? [];
  const selectedProduct = products.find((product) => product.id === selectedId) ?? null;

  return (
    <Screen title={copy.adminControl.inventorySummary} subtitle={copy.adminControl.subtitle} showSubtitle>
      <QueryState loading={inventoryQuery.isLoading || productsQuery.isLoading} error={(inventoryQuery.error instanceof Error && inventoryQuery.error.message) || (productsQuery.error instanceof Error && productsQuery.error.message) || null} />
      {feedback ? (
        <Card>
          <MutedText>{feedback}</MutedText>
        </Card>
      ) : null}

      {inventory ? (
        <Card>
          <SectionTitle>{copy.adminControl.inventory}</SectionTitle>
          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <InlineStat label={copy.adminControl.activeSkus} value={inventory.total_active_products} />
            <InlineStat label={copy.adminControl.lowStock} value={inventory.low_stock_count} />
            <InlineStat label={copy.adminControl.outOfStock} value={inventory.out_of_stock_count} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{copy.adminControl.inventory}</SectionTitle>
        <Input value={search} onChangeText={setSearch} placeholder={copy.adminControl.searchProducts} />
        <ChipRow items={STATUS_FILTERS.map((item) => ({ id: item, label: statusLabel(item, copy) }))} activeId={statusFilter} onSelect={(id) => setStatusFilter(id as typeof statusFilter)} />
        <ChipRow
          items={["ALL", ...CATEGORIES].map((item) => ({ id: item, label: item === "ALL" ? copy.adminControl.allProducts : productCategoryLabel(item, copy) }))}
          activeId={categoryFilter}
          onSelect={(id) => setCategoryFilter(id as typeof categoryFilter)}
        />
        {products.length === 0 ? <MutedText>{copy.financeScreen.noProducts}</MutedText> : null}
        {products.map((product) => {
          const active = selectedId === product.id;
          return (
            <Pressable
              key={product.id}
              onPress={() => {
                setSelectedId(product.id);
                setForm(productToForm(product));
                setTargetQuantity(String(product.low_stock_restock_target ?? ""));
              }}
              style={[styles.productRow, { backgroundColor: active ? theme.cardAlt : "transparent", borderColor: active ? theme.primary : theme.border }]}
            >
              <View style={[styles.productHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.textColumn}>
                  <Text style={[styles.title, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{product.name}</Text>
                  <MutedText>{[product.sku, productCategoryLabel(product.category, copy), `${copy.financeScreen.stock}: ${product.stock_quantity}`].filter(Boolean).join(" - ")}</MutedText>
                </View>
                <Text style={[styles.stock, { color: product.stock_quantity <= product.low_stock_threshold ? "#A53A22" : theme.primary, fontFamily: fontSet.mono }]}>{product.stock_quantity}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>{selectedId ? copy.adminControl.editProduct : copy.adminControl.createProduct}</SectionTitle>
        {!selectedId ? <MutedText>{copy.adminControl.selectProduct}</MutedText> : null}
        <ProductFormFields form={form} setForm={setForm} />
        <View style={styles.actionRow}>
          <PrimaryButton onPress={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
            {copy.adminControl.saveProduct}
          </PrimaryButton>
          <SecondaryButton
            onPress={() => {
              setSelectedId(null);
              setForm(EMPTY_FORM);
            }}
          >
            {copy.adminControl.createProduct}
          </SecondaryButton>
          {selectedId ? (
            <SecondaryButton onPress={() => deactivateMutation.mutate(selectedId)} disabled={deactivateMutation.isPending}>
              {copy.adminControl.deactivateProduct}
            </SecondaryButton>
          ) : null}
        </View>
      </Card>

      {selectedProduct ? (
        <Card>
          <SectionTitle>{copy.adminControl.lowStock}</SectionTitle>
          <MutedText>{`${copy.adminControl.threshold}: ${selectedProduct.low_stock_threshold}`}</MutedText>
          <View style={styles.actionRow}>
            <SecondaryButton onPress={() => lowStockMutation.mutate({ action: "ack", productId: selectedProduct.id })} disabled={lowStockMutation.isPending}>
              {copy.adminControl.acknowledge}
            </SecondaryButton>
            <Input value={snoozeHours} onChangeText={setSnoozeHours} placeholder={copy.adminControl.snoozeHours} keyboardType="number-pad" style={styles.smallInput} />
            <SecondaryButton onPress={() => lowStockMutation.mutate({ action: "snooze", productId: selectedProduct.id })} disabled={lowStockMutation.isPending}>
              {copy.adminControl.snooze}
            </SecondaryButton>
          </View>
          <View style={styles.actionRow}>
            <Input value={targetQuantity} onChangeText={setTargetQuantity} placeholder={copy.adminControl.restockTarget} keyboardType="number-pad" style={styles.smallInput} />
            <SecondaryButton onPress={() => lowStockMutation.mutate({ action: "target", productId: selectedProduct.id })} disabled={lowStockMutation.isPending}>
              {copy.adminControl.setTarget}
            </SecondaryButton>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

function ProductFormFields({ form, setForm }: { form: ProductForm; setForm: (form: ProductForm) => void }) {
  const { copy } = usePreferences();
  const setField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm({ ...form, [key]: value });
  return (
    <>
      <Input value={form.name} onChangeText={(value) => setField("name", value)} placeholder={copy.adminControl.productName} />
      <Input value={form.sku} onChangeText={(value) => setField("sku", value)} placeholder={copy.adminControl.sku} />
      <ChipRow items={CATEGORIES.map((item) => ({ id: item, label: productCategoryLabel(item, copy) }))} activeId={form.category} onSelect={(id) => setField("category", id as ProductForm["category"])} />
      <Input value={form.price} onChangeText={(value) => setField("price", value)} placeholder={copy.adminControl.price} keyboardType="decimal-pad" />
      <Input value={form.cost_price} onChangeText={(value) => setField("cost_price", value)} placeholder={copy.adminControl.costPrice} keyboardType="decimal-pad" />
      <Input value={form.stock_quantity} onChangeText={(value) => setField("stock_quantity", value)} placeholder={copy.adminControl.stockQuantity} keyboardType="number-pad" />
      <Input value={form.low_stock_threshold} onChangeText={(value) => setField("low_stock_threshold", value)} placeholder={copy.adminControl.threshold} keyboardType="number-pad" />
      <Input value={form.low_stock_restock_target} onChangeText={(value) => setField("low_stock_restock_target", value)} placeholder={copy.adminControl.restockTarget} keyboardType="number-pad" />
      <Input value={form.image_url} onChangeText={(value) => setField("image_url", value)} placeholder={copy.adminControl.imageUrl} />
      <ChipRow
        items={[
          { id: "active", label: copy.adminControl.showActive },
          { id: "inactive", label: copy.adminControl.showInactive },
        ]}
        activeId={form.is_active ? "active" : "inactive"}
        onSelect={(id) => setField("is_active", id === "active")}
      />
    </>
  );
}

function ChipRow({ activeId, items, onSelect }: { activeId: string; items: { id: string; label: string }[]; onSelect: (id: string) => void }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.cardAlt, borderColor: theme.border }]}>
            <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function productToForm(product: MobileInventoryProduct): ProductForm {
  return {
    name: product.name,
    sku: product.sku ?? "",
    category: CATEGORIES.includes(product.category as ProductForm["category"]) ? (product.category as ProductForm["category"]) : "OTHER",
    price: String(product.price),
    cost_price: product.cost_price == null ? "" : String(product.cost_price),
    stock_quantity: String(product.stock_quantity),
    low_stock_threshold: String(product.low_stock_threshold),
    low_stock_restock_target: product.low_stock_restock_target == null ? "" : String(product.low_stock_restock_target),
    image_url: product.image_url ?? "",
    is_active: product.is_active,
  };
}

function formToPayload(form: ProductForm) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    category: form.category,
    price: Number(form.price) || 0,
    cost_price: form.cost_price.trim() ? Number(form.cost_price) : null,
    stock_quantity: Number(form.stock_quantity) || 0,
    low_stock_threshold: Number(form.low_stock_threshold) || 0,
    low_stock_restock_target: form.low_stock_restock_target.trim() ? Number(form.low_stock_restock_target) : null,
    image_url: form.image_url.trim() || null,
    is_active: form.is_active,
  };
}

function statusLabel(status: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (status === "inactive") {
    return copy.adminControl.showInactive;
  }
  if (status === "all") {
    return copy.adminControl.allProducts;
  }
  return copy.adminControl.showActive;
}

function productCategoryLabel(category: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  const labels = copy.adminControl.productCategories as Record<string, string>;
  return labels[category] ?? category;
}

const styles = StyleSheet.create({
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  productRow: {
    borderWidth: 1,
    borderRadius: 8,
    gap: 10,
    padding: 12,
  },
  productHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
    flexDirection: "column",
    gap: 10,
  },
  smallInput: {
    minWidth: 120,
  },
});

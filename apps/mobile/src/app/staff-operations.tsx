import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileAdminStaffListItem } from "@gym-erp/contracts";

import { Card, InlineStat, Input, MutedText, QueryState, Screen, SectionTitle, SecondaryButton } from "@/components/ui";
import { parseAdminStaffDetailEnvelope, parseAdminStaffListEnvelope } from "@/lib/api";
import { localizeContractType, localizeLeaveStatus, localizePayrollStatus, localizeRole, localeTag } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const ROLE_FILTERS = ["ALL", "MANAGER", "COACH", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"] as const;
const STATUS_FILTERS = ["all", "active", "inactive"] as const;

export default function StaffOperationsScreen() {
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, isRTL } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>("ALL");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const localeName = localeTag(isRTL);

  const canUse = isAdminControlRole(role);

  const staffQuery = useQuery({
    queryKey: ["mobile-admin-staff-operations", search.trim(), roleFilter, statusFilter, role],
    enabled: canUse,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return parseAdminStaffListEnvelope(await authorizedRequest(`/mobile/admin/staff${suffix}`)).data;
    },
  });

  const staff = useMemo(() => staffQuery.data?.items ?? [], [staffQuery.data?.items]);
  const selectedStaff = useMemo(
    () => staff.find((item) => item.id === selectedId) ?? staff[0] ?? null,
    [selectedId, staff],
  );

  const detailQuery = useQuery({
    queryKey: ["mobile-admin-staff-operation-detail", selectedStaff?.id],
    enabled: canUse && Boolean(selectedStaff?.id),
    queryFn: async () => parseAdminStaffDetailEnvelope(await authorizedRequest(`/mobile/admin/staff/${selectedStaff?.id}`)).data,
  });

  if (!canUse) {
    return (
      <Screen title={copy.adminControl.employeeOperations} subtitle={copy.adminControl.subtitle} showSubtitle>
        <Card>
          <MutedText>{copy.adminControl.auditAdminOnly}</MutedText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={copy.adminControl.employeeOperations} subtitle={copy.adminControl.subtitle} showSubtitle>
      <Card>
        <SectionTitle>{copy.adminControl.staffRoster}</SectionTitle>
        <Input value={search} onChangeText={setSearch} placeholder={copy.adminControl.searchStaff} />
        <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {ROLE_FILTERS.map((item) => (
            <Chip
              key={item}
              label={item === "ALL" ? copy.adminControl.allRoles : localizeRole(item, isRTL)}
              active={roleFilter === item}
              onPress={() => setRoleFilter(item)}
            />
          ))}
        </View>
        <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {STATUS_FILTERS.map((item) => (
            <Chip key={item} label={statusFilterLabel(item, copy)} active={statusFilter === item} onPress={() => setStatusFilter(item)} />
          ))}
        </View>
      </Card>

      <QueryState
        loading={staffQuery.isLoading}
        error={staffQuery.error instanceof Error ? staffQuery.error.message : null}
        empty={!staffQuery.isLoading && staff.length === 0}
        emptyMessage={copy.common.noData}
      />

      {staff.length ? (
        <Card>
          {staff.map((item) => (
            <StaffRow
              key={item.id}
              item={item}
              active={selectedStaff?.id === item.id}
              onPress={() => setSelectedId(item.id)}
            />
          ))}
        </Card>
      ) : null}

      <QueryState loading={detailQuery.isLoading} error={detailQuery.error instanceof Error ? detailQuery.error.message : null} />
      {detailQuery.data ? (
        <>
          <Card>
            <View style={[styles.headerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.flex}>
                <SectionTitle>{detailQuery.data.staff.full_name || detailQuery.data.staff.email}</SectionTitle>
                <MutedText>{detailQuery.data.staff.email}</MutedText>
                <MutedText>{localizeRole(detailQuery.data.staff.role, isRTL)}</MutedText>
              </View>
              <StatusBadge label={detailQuery.data.staff.is_active ? copy.adminControl.activeStaff : copy.adminControl.inactiveStaff} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.contract}</SectionTitle>
            {detailQuery.data.contract ? (
              <>
                <InlineStat label={copy.adminControl.contract} value={localizeContractType(detailQuery.data.contract.type, isRTL)} />
                <InlineStat label={copy.adminControl.baseSalary} value={formatMoney(detailQuery.data.contract.base_salary, localeName)} />
                <MutedText>
                  {[detailQuery.data.contract.start_date, detailQuery.data.contract.end_date]
                    .filter(Boolean)
                    .map((value) => new Date(String(value)).toLocaleDateString(localeName))
                    .join(" - ")}
                </MutedText>
              </>
            ) : (
              <MutedText>{copy.adminControl.noContract}</MutedText>
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.attendance}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.clockedIn} value={detailQuery.data.attendance_summary.clocked_in ? copy.adminControl.activeStaff : copy.adminControl.notClockedIn} />
              <InlineStat label={copy.adminControl.daysPresent} value={detailQuery.data.attendance_summary.month_days_present} />
              <InlineStat label={copy.adminControl.monthHours} value={detailQuery.data.attendance_summary.month_hours} />
            </View>
            {detailQuery.data.recent_attendance.length === 0 ? <MutedText>{copy.common.noData}</MutedText> : null}
            {detailQuery.data.recent_attendance.slice(0, 5).map((item) => (
              <SimpleRow
                key={item.id}
                title={item.check_in_time ? new Date(item.check_in_time).toLocaleString(localeName) : "--"}
                subtitle={item.check_out_time ? new Date(item.check_out_time).toLocaleString(localeName) : copy.adminControl.clockedIn}
                trailing={`${item.hours_worked}`}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.recentLeaves}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.pendingLeaves} value={detailQuery.data.leave_summary.pending} />
              <InlineStat label={copy.adminControl.approve} value={detailQuery.data.leave_summary.approved} />
              <InlineStat label={copy.adminControl.deny} value={detailQuery.data.leave_summary.denied} />
            </View>
            {detailQuery.data.recent_leaves.length === 0 ? <MutedText>{copy.common.noData}</MutedText> : null}
            {detailQuery.data.recent_leaves.slice(0, 5).map((item) => (
              <SimpleRow
                key={item.id}
                title={localizeLeaveStatus(item.status, isRTL)}
                subtitle={`${item.start_date} - ${item.end_date}`}
                trailing={(copy.adminControl.leaveTypes as Record<string, string>)[item.leave_type] || item.leave_type}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.payroll}</SectionTitle>
            {detailQuery.data.payroll_summary ? (
              <>
                <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <InlineStat label={copy.adminControl.latestPayroll} value={`${detailQuery.data.payroll_summary.month}/${detailQuery.data.payroll_summary.year}`} />
                  <InlineStat label={copy.common.status} value={localizePayrollStatus(detailQuery.data.payroll_summary.status, isRTL)} />
                  <InlineStat label={copy.financeScreen.total} value={formatMoney(detailQuery.data.payroll_summary.total_pay, localeName)} />
                </View>
                {detailQuery.data.recent_payrolls.slice(0, 4).map((item) => (
                  <SimpleRow
                    key={item.id}
                    title={`${item.month}/${item.year}`}
                    subtitle={localizePayrollStatus(item.status, isRTL)}
                    trailing={formatMoney(item.total_pay, localeName)}
                  />
                ))}
              </>
            ) : (
              <MutedText>{copy.adminControl.noPayroll}</MutedText>
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.actions}</SectionTitle>
            <View style={[styles.actionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <SecondaryButton onPress={() => setSelectedId(detailQuery.data?.staff.id ?? null)}>{copy.adminControl.staffDetail}</SecondaryButton>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function StaffRow({ item, active, onPress }: { item: MobileAdminStaffListItem; active: boolean; onPress: () => void }) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.staffRow,
        {
          backgroundColor: active ? theme.primarySoft : theme.cardAlt,
          borderColor: active ? theme.primary : theme.border,
          flexDirection: isRTL ? "row-reverse" : "row",
        },
      ]}
    >
      <View style={styles.flex}>
        <Text style={[styles.staffName, { color: active ? theme.primary : theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
          {item.full_name || item.email}
        </Text>
        <MutedText>{[localizeRole(item.role, isRTL), item.today_attendance.clocked_in ? copy.adminControl.clockedIn : copy.adminControl.notClockedIn].join(" - ")}</MutedText>
        {item.latest_payroll ? <MutedText>{`${copy.adminControl.latestPayroll}: ${localizePayrollStatus(item.latest_payroll.status, isRTL)}`}</MutedText> : null}
      </View>
      <View style={[styles.rowTrailing, { alignItems: isRTL ? "flex-start" : "flex-end" }]}>
        <StatusBadge label={item.is_active ? copy.adminControl.activeStaff : copy.adminControl.inactiveStaff} />
        {item.pending_leave_requests > 0 ? <StatusBadge label={`${copy.adminControl.pendingLeaves}: ${item.pending_leave_requests}`} /> : null}
      </View>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? theme.primary : theme.cardAlt, borderColor: theme.border }]}>
      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{label}</Text>
    </Pressable>
  );
}

function StatusBadge({ label }: { label: string }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.statusBadge, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
      <Text style={[styles.statusBadgeText, { color: theme.primary, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{label}</Text>
    </View>
  );
}

function SimpleRow({ title, subtitle, trailing }: { title: string; subtitle?: string | null; trailing?: string | number | null }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.simpleRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <View style={styles.flex}>
        <Text style={[styles.simpleTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
          {title}
        </Text>
        {subtitle ? <MutedText>{subtitle}</MutedText> : null}
      </View>
      {trailing != null ? <Text style={[styles.trailingText, { color: theme.primary, fontFamily: fontSet.mono }]}>{trailing}</Text> : null}
    </View>
  );
}

function statusFilterLabel(value: (typeof STATUS_FILTERS)[number], copy: ReturnType<typeof usePreferences>["copy"]) {
  if (value === "active") return copy.adminControl.activeStaff;
  if (value === "inactive") return copy.adminControl.inactiveStaff;
  return copy.adminControl.allStatuses;
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "JOD", maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  chipRow: {
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  staffRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  staffName: {
    fontSize: 15,
    fontWeight: "800",
  },
  rowTrailing: {
    gap: 6,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  headerRow: {
    alignItems: "center",
    gap: 12,
  },
  statGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  simpleRow: {
    alignItems: "center",
    borderTopWidth: 1,
    gap: 10,
    paddingVertical: 10,
  },
  simpleTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  trailingText: {
    fontSize: 12,
    fontWeight: "800",
  },
  actionRow: {
    flexWrap: "wrap",
    gap: 10,
  },
});

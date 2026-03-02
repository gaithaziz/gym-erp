import { View } from "react-native";

import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";
import { SectionChip } from "@/src/core/ui/section-chip";

export function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <SectionCard className="min-h-[132px] justify-between">
      <SectionChip label={label} />
      <View className="gap-1">
        <AppText className="font-mono text-3xl font-bold tracking-tight text-foreground">{value}</AppText>
        <AppText className="text-xs text-muted-foreground">{subtitle}</AppText>
      </View>
    </SectionCard>
  );
}

import { View } from "react-native";

import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";

export function ShellHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <SectionCard className="gap-3">
      <AppText variant="label" className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-orange-500">{eyebrow}</AppText>
      <AppText variant="title">{title}</AppText>
      <AppText variant="subtitle">{subtitle}</AppText>
      <View className="mt-1 h-1 w-20 bg-accent/70" />
    </SectionCard>
  );
}

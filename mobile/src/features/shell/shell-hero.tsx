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
      <AppText variant="label">{eyebrow}</AppText>
      <AppText variant="title">{title}</AppText>
      <AppText variant="subtitle">{subtitle}</AppText>
      <View className="mt-1 h-1.5 w-24 rounded-full bg-accent/70" />
    </SectionCard>
  );
}

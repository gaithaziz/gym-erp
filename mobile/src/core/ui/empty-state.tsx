import { View } from "react-native";

import { AppText } from "@/src/core/ui/app-text";

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="items-center gap-2 rounded-3xl border border-dashed border-border bg-panel px-5 py-8">
      <AppText variant="title" className="text-xl">
        {title}
      </AppText>
      {subtitle ? <AppText className="text-center text-muted">{subtitle}</AppText> : null}
    </View>
  );
}

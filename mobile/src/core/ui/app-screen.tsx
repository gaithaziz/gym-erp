import { SafeAreaView } from "react-native-safe-area-context";
import { View, type ViewProps } from "react-native";

export function AppScreen({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-sand">
      <View className="absolute inset-0">
        <View className="absolute -top-16 -left-12 h-48 w-48 rounded-full bg-accent/10" />
        <View className="absolute right-0 top-28 h-56 w-56 rounded-full bg-white/60" />
        <View className="absolute bottom-0 left-8 h-40 w-40 rounded-full bg-accent/5" />
      </View>
      <View className={`flex-1 px-5 py-4 ${className}`} {...props} />
    </SafeAreaView>
  );
}

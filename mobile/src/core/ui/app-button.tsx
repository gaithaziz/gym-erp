import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type ButtonVariant = "primary" | "secondary";

const variantClassName: Record<ButtonVariant, string> = {
  primary: "bg-accent",
  secondary: "bg-panel border border-border",
};

const textClassName: Record<ButtonVariant, string> = {
  primary: "text-white",
  secondary: "text-ink",
};

export function AppButton({
  title,
  loading = false,
  variant = "primary",
  className = "",
  ...props
}: PressableProps & {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Pressable
      className={`min-h-12 items-center justify-center rounded-2xl px-4 ${variantClassName[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#ffffff" : "#111827"} />
      ) : (
        <Text className={`text-sm font-semibold ${textClassName[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}

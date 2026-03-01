import { Text, type TextProps } from "react-native";

type Variant = "title" | "subtitle" | "body" | "label";

const variantClassName: Record<Variant, string> = {
  title: "text-3xl font-semibold text-ink",
  subtitle: "text-base text-muted",
  body: "text-base text-ink",
  label: "text-xs uppercase tracking-[1.5px] text-muted",
};

export function AppText({
  className = "",
  variant = "body",
  ...props
}: TextProps & { variant?: Variant; className?: string }) {
  return <Text className={`${variantClassName[variant]} ${className}`} {...props} />;
}

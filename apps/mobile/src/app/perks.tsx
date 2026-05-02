import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function PerksRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/billing");
  }, [router]);

  return null;
}

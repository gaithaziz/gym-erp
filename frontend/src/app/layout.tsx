import type { Metadata } from "next";
import { Fraunces, Outfit, JetBrains_Mono, Tajawal } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  display: "swap",
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "OmniGYM",
  description: "Gym Management System",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icon.png",
  },
};

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FeedbackProvider } from "@/components/FeedbackProvider";
import { LocaleProvider } from "@/context/LocaleContext";
import { BranchProvider } from "@/context/BranchContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const htmlLang = "en";
  const htmlDir = "ltr";
  const themeAttribute = "class";
  const themeDefault = "dark";
  return (
    <html lang={htmlLang} dir={htmlDir} suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${tajawal.variable} antialiased font-serif bg-background text-foreground`}
      >
        <ThemeProvider
          attribute={themeAttribute}
          defaultTheme={themeDefault}
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider>
            <AuthProvider>
              <BranchProvider>
                <FeedbackProvider>{children}</FeedbackProvider>
              </BranchProvider>
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

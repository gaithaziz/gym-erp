import type { enMessages } from "./locales/en";

export type Locale = "en" | "ar";
export type Direction = "ltr" | "rtl";
export type Messages = typeof enMessages;

type DotPath<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${DotPath<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = DotPath<Messages>;

import { describe, expect, it } from "vitest";

import { getArabicTextStyle } from "./arabic-typography";

describe("arabic typography", () => {
  it("raises the line height for compact arabic titles", () => {
    expect(getArabicTextStyle({ fontSize: 21, lineHeight: 24 })).toMatchObject({
      lineHeight: 29,
      letterSpacing: 0,
    });
  });

  it("keeps an explicit roomy line height and clears spacing", () => {
    expect(getArabicTextStyle({ fontSize: 16, lineHeight: 30 })).toMatchObject({
      lineHeight: 30,
      letterSpacing: 0,
    });
  });
});

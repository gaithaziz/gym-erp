import { describe, expect, it } from "vitest";

import { getPlanSectionNames, resolveSelectedSection } from "./workout-plan-selection";

describe("workout-plan-selection", () => {
  it("returns unique trimmed section names in encounter order", () => {
    const plan = {
      exercises: [
        { section_name: "  Alpha  " },
        { section_name: "Beta" },
        { section_name: "Alpha" },
        { section_name: " " },
        {},
      ],
    };

    expect(getPlanSectionNames(plan)).toEqual(["Alpha", "Beta"]);
  });

  it("falls back to the first available section when the preferred one is absent", () => {
    const plan = {
      exercises: [{ section_name: "Alpha" }, { section_name: "Beta" }],
    };

    expect(resolveSelectedSection(plan, "Gamma")).toBe("Alpha");
  });

  it("keeps the preferred section when it still exists", () => {
    const plan = {
      exercises: [{ section_name: "Alpha" }, { section_name: "Beta" }],
    };

    expect(resolveSelectedSection(plan, "Beta")).toBe("Beta");
  });

  it("returns null when a plan has no sections", () => {
    expect(resolveSelectedSection({ exercises: [{ section_name: " " }] }, "Alpha")).toBeNull();
  });
});

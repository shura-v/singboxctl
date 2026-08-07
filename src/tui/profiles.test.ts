import { describe, expect, it } from "vitest";
import { getAvailableRuleSetNames } from "./profiles.js";

describe("getAvailableRuleSetNames", () => {
  it("does not pass deleted rule sets back to the profile selector", () => {
    expect(
      getAvailableRuleSetNames(["active", "deleted"], [
        { name: "active" },
        { name: "other" }
      ])
    ).toEqual(["active"]);
  });
});

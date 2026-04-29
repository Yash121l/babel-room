import { describe, expect, it } from "vitest";
import { stripTranslationArtifacts } from "../src/sanitize";

describe("stripTranslationArtifacts", () => {
  it("removes corrupted xt/ext tags", () => {
    expect(stripTranslationArtifacts("<xt>De acuerdo.</ext>")).toBe("De acuerdo.");
  });

  it("removes text wrapper tags", () => {
    expect(stripTranslationArtifacts("<text>Hola</text>")).toBe("Hola");
  });

  it("trims and normalizes spaces", () => {
    expect(stripTranslationArtifacts("  hello  \n  world  ")).toBe("hello world");
  });
});

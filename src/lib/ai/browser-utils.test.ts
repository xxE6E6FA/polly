import { describe, expect, it } from "vitest";
import { getEnvironmentApiKey, humanizeText } from "./browser-utils";

describe("browser-utils", () => {
  describe("humanizeText", () => {
    it("fixes double spaces", () => {
      expect(humanizeText("Hello  world")).toBe("Hello world");
      expect(humanizeText("Multiple   spaces    here")).toBe(
        "Multiple spaces here"
      );
      expect(humanizeText("Tab\t\tspaces")).toBe("Tab spaces");
    });

    it("fixes spaces before punctuation", () => {
      expect(humanizeText("Hello , world")).toBe("Hello, world");
      expect(humanizeText("Yes ! No ? Maybe .")).toBe("Yes! No? Maybe.");
      expect(humanizeText("List : item ; another")).toBe("List: item; another");
    });

    it("ensures space after punctuation", () => {
      expect(humanizeText("Hello,world")).toBe("Hello, world");
      expect(humanizeText("Yes!No?Maybe.")).toBe("Yes! No? Maybe.");
      expect(humanizeText("First.Second:Third;Fourth")).toBe(
        "First. Second: Third; Fourth"
      );
    });

    it("trims whitespace", () => {
      expect(humanizeText("  Hello world  ")).toBe("Hello world");
      expect(humanizeText("\n\tHello\n\t")).toBe("Hello");
    });

    it("handles complex combinations", () => {
      const input = "  Hello  ,world !How are you?I'm fine.  ";
      const expected = "Hello, world! How are you? I'm fine.";
      expect(humanizeText(input)).toBe(expected);
    });

    it("handles empty and edge cases", () => {
      expect(humanizeText("")).toBe("");
      expect(humanizeText("   ")).toBe("");
      expect(humanizeText("Hello")).toBe("Hello");
      expect(humanizeText(".")).toBe(".");
      expect(humanizeText(".,!?;:")).toBe(".,!?;:");
    });

    it("preserves intended single spaces", () => {
      expect(humanizeText("Hello world")).toBe("Hello world");
      expect(humanizeText("One. Two. Three.")).toBe("One. Two. Three.");
    });

    it("handles punctuation at start and end", () => {
      expect(humanizeText(",Hello world.")).toBe(", Hello world."); // Space is added after comma
      expect(humanizeText("Hello world,")).toBe("Hello world,");
    });
  });

  describe("getEnvironmentApiKey", () => {
    it("returns null for all providers (client-side)", () => {
      expect(getEnvironmentApiKey("openai")).toBe(null);
      expect(getEnvironmentApiKey("anthropic")).toBe(null);
      expect(getEnvironmentApiKey("google")).toBe(null);
      expect(getEnvironmentApiKey("groq")).toBe(null);
      expect(getEnvironmentApiKey("openrouter")).toBe(null);
      expect(getEnvironmentApiKey("exa")).toBe(null);
    });

    it("returns null for unknown providers", () => {
      expect(getEnvironmentApiKey("unknown")).toBe(null);
      expect(getEnvironmentApiKey("")).toBe(null);
      expect(getEnvironmentApiKey("invalid")).toBe(null);
    });

    it("handles edge cases", () => {
      // @ts-expect-error - Testing invalid input types
      expect(getEnvironmentApiKey(null)).toBe(null);
      // @ts-expect-error - Testing invalid input types
      expect(getEnvironmentApiKey(undefined)).toBe(null);
      // @ts-expect-error - Testing invalid input types
      expect(getEnvironmentApiKey(123)).toBe(null);
    });
  });
});

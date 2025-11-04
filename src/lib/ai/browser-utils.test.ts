import { describe, expect, test } from "bun:test";
import { getEnvironmentApiKey, humanizeText } from "./browser-utils";

describe("browser-utils", () => {
  describe("humanizeText", () => {
    test("fixes double spaces", () => {
      expect(humanizeText("Hello  world")).toBe("Hello world");
      expect(humanizeText("Multiple   spaces    here")).toBe(
        "Multiple spaces here"
      );
      expect(humanizeText("Tab\t\tspaces")).toBe("Tab spaces");
    });

    test("fixes spaces before punctuation", () => {
      expect(humanizeText("Hello , world")).toBe("Hello, world");
      expect(humanizeText("Yes ! No ? Maybe .")).toBe("Yes! No? Maybe.");
      expect(humanizeText("List : item ; another")).toBe("List: item; another");
    });

    test("ensures space after punctuation", () => {
      expect(humanizeText("Hello,world")).toBe("Hello, world");
      expect(humanizeText("Yes!No?Maybe.")).toBe("Yes! No? Maybe.");
      expect(humanizeText("First.Second:Third;Fourth")).toBe(
        "First. Second: Third; Fourth"
      );
    });

    test("trims whitespace", () => {
      expect(humanizeText("  Hello world  ")).toBe("Hello world");
      expect(humanizeText("\n\tHello\n\t")).toBe("Hello");
    });

    test("handles complex combinations", () => {
      const input = "  Hello  ,world !How are you?I'm fine.  ";
      const expected = "Hello, world! How are you? I'm fine.";
      expect(humanizeText(input)).toBe(expected);
    });

    test("handles empty and edge cases", () => {
      expect(humanizeText("")).toBe("");
      expect(humanizeText("   ")).toBe("");
      expect(humanizeText("Hello")).toBe("Hello");
      expect(humanizeText(".")).toBe(".");
      expect(humanizeText(".,!?;:")).toBe(".,!?;:");
    });

    test("preserves intended single spaces", () => {
      expect(humanizeText("Hello world")).toBe("Hello world");
      expect(humanizeText("One. Two. Three.")).toBe("One. Two. Three.");
    });

    test("handles punctuation at start and end", () => {
      expect(humanizeText(",Hello world.")).toBe(", Hello world."); // Space is added after comma
      expect(humanizeText("Hello world,")).toBe("Hello world,");
    });
  });

  describe("getEnvironmentApiKey", () => {
    test("returns null for all providers (client-side)", () => {
      expect(getEnvironmentApiKey("openai")).toBe(null);
      expect(getEnvironmentApiKey("anthropic")).toBe(null);
      expect(getEnvironmentApiKey("google")).toBe(null);
      expect(getEnvironmentApiKey("groq")).toBe(null);
      expect(getEnvironmentApiKey("openrouter")).toBe(null);
      expect(getEnvironmentApiKey("exa")).toBe(null);
    });

    test("returns null for unknown providers", () => {
      expect(getEnvironmentApiKey("unknown")).toBe(null);
      expect(getEnvironmentApiKey("")).toBe(null);
      expect(getEnvironmentApiKey("invalid")).toBe(null);
    });

    test("handles edge cases", () => {
      // @ts-expect-error - Testing invalid input types
      expect(getEnvironmentApiKey(null)).toBe(null);
      // @ts-expect-error - Testing invalid input types
      expect(getEnvironmentApiKey(undefined)).toBe(null);
      // @ts-expect-error - Testing invalid input types
      expect(getEnvironmentApiKey(123)).toBe(null);
    });
  });
});

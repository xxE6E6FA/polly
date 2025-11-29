import { describe, expect, test } from "bun:test";
import { generateGridTemplate } from "@/lib/grid-utils";

describe("gridUtils: generateGridTemplate", () => {
  describe("basic column generation", () => {
    test("generates flexible columns when no widths provided", () => {
      const template = generateGridTemplate([undefined, undefined, undefined]);
      expect(template).toBe("minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)");
    });

    test("generates empty string for empty array", () => {
      const template = generateGridTemplate([]);
      expect(template).toBe("");
    });

    test("mixes fixed and flexible columns", () => {
      const template = generateGridTemplate(["w-32", undefined, "w-48"]);
      expect(template).toBe("8rem minmax(0, 1fr) 12rem");
    });
  });

  describe("selection checkbox column", () => {
    test("adds auto-sized checkbox column when hasSelection is true", () => {
      const template = generateGridTemplate(["w-32", "w-48"], true);
      expect(template).toBe("auto 8rem 12rem");
    });

    test("does not add checkbox column when hasSelection is false", () => {
      const template = generateGridTemplate(["w-32", "w-48"], false);
      expect(template).toBe("8rem 12rem");
    });

    test("does not add checkbox column when hasSelection is undefined", () => {
      const template = generateGridTemplate(["w-32", "w-48"]);
      expect(template).toBe("8rem 12rem");
    });
  });

  describe("fixed width classes (rem-based)", () => {
    test("converts w-4 to 1rem", () => {
      const template = generateGridTemplate(["w-4"]);
      expect(template).toBe("1rem");
    });

    test("converts w-8 to 2rem", () => {
      const template = generateGridTemplate(["w-8"]);
      expect(template).toBe("2rem");
    });

    test("converts w-32 to 8rem", () => {
      const template = generateGridTemplate(["w-32"]);
      expect(template).toBe("8rem");
    });

    test("converts w-48 to 12rem", () => {
      const template = generateGridTemplate(["w-48"]);
      expect(template).toBe("12rem");
    });

    test("converts w-96 to 24rem", () => {
      const template = generateGridTemplate(["w-96"]);
      expect(template).toBe("24rem");
    });

    test("handles multiple fixed widths", () => {
      const template = generateGridTemplate(["w-8", "w-32", "w-48", "w-64"]);
      expect(template).toBe("2rem 8rem 12rem 16rem");
    });
  });

  describe("fractional width classes (percentage-based)", () => {
    test("converts w-1/2 to 50%", () => {
      const template = generateGridTemplate(["w-1/2"]);
      expect(template).toBe("50%");
    });

    test("converts w-1/3 to 33.333333%", () => {
      const template = generateGridTemplate(["w-1/3"]);
      expect(template).toBe("33.333333%");
    });

    test("converts w-2/3 to 66.666667%", () => {
      const template = generateGridTemplate(["w-2/3"]);
      expect(template).toBe("66.666667%");
    });

    test("converts w-1/4 to 25%", () => {
      const template = generateGridTemplate(["w-1/4"]);
      expect(template).toBe("25%");
    });

    test("converts w-3/4 to 75%", () => {
      const template = generateGridTemplate(["w-3/4"]);
      expect(template).toBe("75%");
    });

    test("converts w-full to 100%", () => {
      const template = generateGridTemplate(["w-full"]);
      expect(template).toBe("100%");
    });

    test("handles fractional widths with other utilities", () => {
      const template = generateGridTemplate(["w-1/2 flex-shrink-0"]);
      expect(template).toBe("50%");
    });
  });

  describe("width classes with additional utilities", () => {
    test("extracts width from string with flex-shrink-0", () => {
      const template = generateGridTemplate(["w-32 flex-shrink-0"]);
      expect(template).toBe("8rem");
    });

    test("extracts width from string with multiple utilities", () => {
      const template = generateGridTemplate(["w-48 flex-shrink-0 ml-4"]);
      expect(template).toBe("12rem");
    });

    test("handles width with arbitrary utility order", () => {
      const template = generateGridTemplate(["flex-shrink-0 w-32 ml-4"]);
      expect(template).toBe("8rem");
    });
  });

  describe("unsupported width classes", () => {
    test("falls back to flexible for unrecognized width class", () => {
      const template = generateGridTemplate(["w-999"]);
      expect(template).toBe("minmax(0, 1fr)");
    });

    test("falls back to flexible for arbitrary values", () => {
      const template = generateGridTemplate(["w-[200px]"]);
      expect(template).toBe("minmax(0, 1fr)");
    });

    test("falls back to flexible for unsupported fraction", () => {
      const template = generateGridTemplate(["w-2/7"]);
      expect(template).toBe("minmax(0, 1fr)");
    });
  });

  describe("edge cases", () => {
    test("handles empty string as width", () => {
      const template = generateGridTemplate([""]);
      expect(template).toBe("minmax(0, 1fr)");
    });

    test("handles whitespace-only string", () => {
      const template = generateGridTemplate(["   "]);
      expect(template).toBe("minmax(0, 1fr)");
    });

    test("handles single column", () => {
      const template = generateGridTemplate(["w-32"]);
      expect(template).toBe("8rem");
    });

    test("handles many columns", () => {
      const template = generateGridTemplate([
        "w-8",
        "w-32",
        undefined,
        "w-1/2",
        "w-48",
      ]);
      expect(template).toBe("2rem 8rem minmax(0, 1fr) 50% 12rem");
    });
  });

  describe("real-world usage scenarios", () => {
    test("mimics AttachmentsPage column configuration", () => {
      const template = generateGridTemplate(
        [
          undefined, // Name column - flexible
          "w-32", // Created column - fixed
          "w-40", // Actions column - fixed
        ],
        true // Has selection
      );
      expect(template).toBe("auto minmax(0, 1fr) 8rem 10rem");
    });

    test("handles all fixed-width layout", () => {
      const template = generateGridTemplate(["w-48", "w-32", "w-64"]);
      expect(template).toBe("12rem 8rem 16rem");
    });

    test("handles all flexible layout", () => {
      const template = generateGridTemplate([undefined, undefined, undefined]);
      expect(template).toBe("minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)");
    });

    test("handles mixed percentage and fixed widths", () => {
      const template = generateGridTemplate(["w-1/2", "w-32", "w-1/4"]);
      expect(template).toBe("50% 8rem 25%");
    });
  });
});

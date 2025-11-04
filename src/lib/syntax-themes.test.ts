import { describe, expect, test } from "bun:test";
import { darkSyntaxTheme, lightSyntaxTheme } from "./syntax-themes";

describe("syntax-themes", () => {
  describe("lightSyntaxTheme", () => {
    test("has valid structure", () => {
      expect(lightSyntaxTheme).toHaveProperty("plain");
      expect(lightSyntaxTheme).toHaveProperty("styles");
      expect(Array.isArray(lightSyntaxTheme.styles)).toBe(true);
    });

    test("has plain text styles", () => {
      expect(lightSyntaxTheme.plain).toHaveProperty("color");
      expect(lightSyntaxTheme.plain).toHaveProperty("backgroundColor");
      expect(lightSyntaxTheme.plain.color).toBe("hsl(var(--foreground))");
      expect(lightSyntaxTheme.plain.backgroundColor).toBe("transparent");
    });

    test("has comment styles with italic font", () => {
      const commentStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("comment")
      );

      expect(commentStyle).toBeDefined();
      expect(commentStyle?.style.color).toBe("hsl(var(--muted-foreground))");
      expect(commentStyle?.style.fontStyle).toBe("italic");
    });

    test("has string styles", () => {
      const stringStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("string")
      );

      expect(stringStyle).toBeDefined();
      expect(stringStyle?.style.color).toBe("hsl(var(--accent-emerald))");
    });

    test("has keyword styles", () => {
      const keywordStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("keyword")
      );

      expect(keywordStyle).toBeDefined();
      expect(keywordStyle?.style.color).toBe("hsl(var(--primary))");
    });

    test("adds background emphasis for inserted tokens", () => {
      const insertedStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("inserted")
      );

      expect(insertedStyle).toBeDefined();
      expect(insertedStyle?.style.backgroundColor).toBe(
        "hsl(var(--accent-emerald) / 0.12)"
      );
    });

    test("has function styles", () => {
      const functionStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("function")
      );

      expect(functionStyle).toBeDefined();
      expect(functionStyle?.style.color).toBe("hsl(var(--accent-blue))");
    });

    test("covers expected token types", () => {
      const allTypes = lightSyntaxTheme.styles.flatMap(style => style.types);

      expect(allTypes).toContain("comment");
      expect(allTypes).toContain("string");
      expect(allTypes).toContain("keyword");
      expect(allTypes).toContain("function");
      expect(allTypes).toContain("number");
      expect(allTypes).toContain("operator");
      expect(allTypes).toContain("punctuation");
      expect(allTypes).toContain("tag");
      expect(allTypes).toContain("selector");
    });

    test("uses CSS custom properties for colors", () => {
      lightSyntaxTheme.styles.forEach(style => {
        if (style.style.color) {
          expect(style.style.color).toMatch(
            /^hsl\(var\(--[\w-]+\)(\s*\/\s*0(?:\.\d+)?)?\)$/
          );
        }
      });
    });
  });

  describe("darkSyntaxTheme", () => {
    test("has valid structure", () => {
      expect(darkSyntaxTheme).toHaveProperty("plain");
      expect(darkSyntaxTheme).toHaveProperty("styles");
      expect(Array.isArray(darkSyntaxTheme.styles)).toBe(true);
    });

    test("has plain text styles", () => {
      expect(darkSyntaxTheme.plain).toHaveProperty("color");
      expect(darkSyntaxTheme.plain).toHaveProperty("backgroundColor");
      expect(darkSyntaxTheme.plain.color).toBe("hsl(var(--foreground))");
      expect(darkSyntaxTheme.plain.backgroundColor).toBe("transparent");
    });

    test("has same token types as light theme", () => {
      const lightTypes = lightSyntaxTheme.styles.flatMap(style => style.types);
      const darkTypes = darkSyntaxTheme.styles.flatMap(style => style.types);

      expect(darkTypes.sort()).toEqual(lightTypes.sort());
    });

    test("uses brand accent color for functions", () => {
      const lightFunctionStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("function")
      );
      const darkFunctionStyle = darkSyntaxTheme.styles.find(style =>
        style.types.includes("function")
      );

      expect(lightFunctionStyle?.style.color).toBe("hsl(var(--accent-blue))");
      expect(darkFunctionStyle?.style.color).toBe("hsl(var(--accent-blue))");
    });

    test("deepens inserted token background in dark mode", () => {
      const insertedStyle = darkSyntaxTheme.styles.find(style =>
        style.types.includes("inserted")
      );

      expect(insertedStyle).toBeDefined();
      expect(insertedStyle?.style.backgroundColor).toBe(
        "hsl(var(--accent-emerald) / 0.25)"
      );
    });

    test("has consistent comment styling", () => {
      const lightCommentStyle = lightSyntaxTheme.styles.find(style =>
        style.types.includes("comment")
      );
      const darkCommentStyle = darkSyntaxTheme.styles.find(style =>
        style.types.includes("comment")
      );

      expect(lightCommentStyle?.style).toEqual(darkCommentStyle?.style);
    });

    test("uses CSS custom properties for colors", () => {
      darkSyntaxTheme.styles.forEach(style => {
        if (style.style.color) {
          expect(style.style.color).toMatch(
            /^hsl\(var\(--[\w-]+\)(\s*\/\s*0(?:\.\d+)?)?\)$/
          );
        }
      });
    });
  });

  describe("theme consistency", () => {
    test("both themes have same number of style rules", () => {
      expect(lightSyntaxTheme.styles.length).toBe(
        darkSyntaxTheme.styles.length
      );
    });

    test("both themes have identical structure", () => {
      expect(Object.keys(lightSyntaxTheme.plain)).toEqual(
        Object.keys(darkSyntaxTheme.plain)
      );

      lightSyntaxTheme.styles.forEach((lightStyle, index) => {
        const darkStyle = darkSyntaxTheme.styles[index];
        expect(lightStyle.types.sort()).toEqual(darkStyle.types.sort());
        expect(Object.keys(lightStyle.style)).toEqual(
          Object.keys(darkStyle.style)
        );
      });
    });

    test("namespace styles are slightly softer in dark mode", () => {
      const lightNamespace = lightSyntaxTheme.styles.find(style =>
        style.types.includes("namespace")
      );
      const darkNamespace = darkSyntaxTheme.styles.find(style =>
        style.types.includes("namespace")
      );

      expect(lightNamespace?.style.opacity).toBeGreaterThan(
        darkNamespace?.style.opacity ?? 0
      );
    });

    test("both themes use transparent backgrounds", () => {
      expect(lightSyntaxTheme.plain.backgroundColor).toBe("transparent");
      expect(darkSyntaxTheme.plain.backgroundColor).toBe("transparent");
    });
  });

  describe("style properties validation", () => {
    test("all color values use theme tokens", () => {
      const allStyles = [...lightSyntaxTheme.styles, ...darkSyntaxTheme.styles];

      allStyles.forEach(style => {
        if (style.style.color) {
          expect(style.style.color).toMatch(
            /^hsl\(var\(--[\w-]+\)(\s*\/\s*0(?:\.\d+)?)?\)$/
          );
        }
      });
    });

    test("font styles are properly typed", () => {
      const italicStyles = [
        ...lightSyntaxTheme.styles,
        ...darkSyntaxTheme.styles,
      ].filter(style => style.style.fontStyle);

      italicStyles.forEach(style => {
        expect(style.style.fontStyle).toBe("italic");
      });
    });

    test("opacity values are valid numbers", () => {
      const opacityStyles = [
        ...lightSyntaxTheme.styles,
        ...darkSyntaxTheme.styles,
      ].filter(style => style.style.opacity !== undefined);

      opacityStyles.forEach(style => {
        expect(typeof style.style.opacity).toBe("number");
        expect(style.style.opacity).toBeGreaterThan(0);
        expect(style.style.opacity).toBeLessThanOrEqual(1);
      });
    });
  });
});

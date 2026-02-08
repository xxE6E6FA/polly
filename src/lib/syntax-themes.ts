type ThemeMode = "light" | "dark";

const createSyntaxTheme = (mode: ThemeMode) => ({
  plain: {
    color: "hsl(var(--foreground))",
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: {
        color: "hsl(var(--muted-foreground))",
        fontStyle: "italic" as const,
      },
    },
    {
      types: ["namespace"],
      style: {
        opacity: mode === "light" ? 0.7 : 0.6,
      },
    },
    {
      types: ["punctuation", "operator"],
      style: {
        color: "hsl(var(--accent-foreground))",
        opacity: mode === "light" ? 0.72 : 0.65,
      },
    },
    {
      types: ["string", "char", "attr-value", "template-string"],
      style: {
        color: "hsl(var(--accent-emerald))",
      },
    },
    {
      types: ["inserted"],
      style: {
        color: "hsl(var(--accent-emerald))",
        backgroundColor:
          mode === "light"
            ? "hsl(var(--accent-emerald) / 0.12)"
            : "hsl(var(--accent-emerald) / 0.25)",
      },
    },
    {
      types: ["number", "symbol", "boolean", "constant", "variable"],
      style: {
        color: "hsl(var(--accent-cyan))",
      },
    },
    {
      types: ["property", "attr-name", "class-name"],
      style: {
        color: "hsl(var(--accent-coral))",
      },
    },
    {
      types: ["keyword", "atrule", "selector", "important"],
      style: {
        color: "hsl(var(--primary))",
        fontWeight: "600" as const,
      },
    },
    {
      types: ["tag"],
      style: {
        color: "hsl(var(--accent-pink))",
      },
    },
    {
      types: ["function", "function-variable", "method"],
      style: {
        color: "hsl(var(--accent-blue))",
        fontWeight: "600" as const,
      },
    },
    {
      types: ["builtin"],
      style: {
        color: "hsl(var(--accent-purple))",
      },
    },
    {
      types: ["regex"],
      style: {
        color: "hsl(var(--accent-yellow))",
      },
    },
    {
      types: ["deleted"],
      style: {
        color: "hsl(var(--color-danger))",
      },
    },
    {
      types: ["bold"],
      style: {
        fontWeight: "700" as const,
      },
    },
    {
      types: ["italic"],
      style: {
        fontStyle: "italic" as const,
      },
    },
    {
      types: ["entity"],
      style: {
        cursor: "help",
      },
    },
  ],
});

// Light theme for syntax highlighting
export const lightSyntaxTheme = createSyntaxTheme("light");

// Dark theme for syntax highlighting
export const darkSyntaxTheme = createSyntaxTheme("dark");

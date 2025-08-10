// Light theme for syntax highlighting
export const lightSyntaxTheme = {
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
        opacity: 0.7,
      },
    },
    {
      types: ["string", "attr-value"],
      style: {
        color: "hsl(var(--accent-emerald))",
      },
    },
    {
      types: ["punctuation", "operator"],
      style: {
        color: "hsl(var(--muted-foreground))",
      },
    },
    {
      types: [
        "entity",
        "url",
        "symbol",
        "number",
        "boolean",
        "variable",
        "constant",
        "property",
        "regex",
        "inserted",
      ],
      style: {
        color: "hsl(var(--accent-purple))",
      },
    },
    {
      types: ["atrule", "keyword", "attr-name", "selector"],
      style: {
        color: "hsl(var(--primary))",
      },
    },
    {
      types: ["function", "deleted", "tag"],
      style: {
        color: "hsl(var(--accent-blue))",
      },
    },
    {
      types: ["function-variable"],
      style: {
        color: "hsl(var(--accent-blue))",
      },
    },
    {
      types: ["tag", "selector", "keyword"],
      style: {
        color: "hsl(var(--primary))",
      },
    },
  ],
};

// Dark theme for syntax highlighting
export const darkSyntaxTheme = {
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
        opacity: 0.7,
      },
    },
    {
      types: ["string", "attr-value"],
      style: {
        color: "hsl(var(--accent-emerald))",
      },
    },
    {
      types: ["punctuation", "operator"],
      style: {
        color: "hsl(var(--muted-foreground))",
      },
    },
    {
      types: [
        "entity",
        "url",
        "symbol",
        "number",
        "boolean",
        "variable",
        "constant",
        "property",
        "regex",
        "inserted",
      ],
      style: {
        color: "hsl(var(--accent-purple))",
      },
    },
    {
      types: ["atrule", "keyword", "attr-name", "selector"],
      style: {
        color: "hsl(var(--primary))",
      },
    },
    {
      types: ["function", "deleted", "tag"],
      style: {
        color: "hsl(var(--accent-cyan))",
      },
    },
    {
      types: ["function-variable"],
      style: {
        color: "hsl(var(--accent-cyan))",
      },
    },
    {
      types: ["tag", "selector", "keyword"],
      style: {
        color: "hsl(var(--primary))",
      },
    },
  ],
};

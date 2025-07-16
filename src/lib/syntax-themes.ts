// Light theme for syntax highlighting
export const lightSyntaxTheme = {
  plain: {
    color: "#24292e",
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: {
        color: "#6a737d",
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
        color: "#032f62",
      },
    },
    {
      types: ["punctuation", "operator"],
      style: {
        color: "#24292e",
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
        color: "#005cc5",
      },
    },
    {
      types: ["atrule", "keyword", "attr-name", "selector"],
      style: {
        color: "#d73a49",
      },
    },
    {
      types: ["function", "deleted", "tag"],
      style: {
        color: "#6f42c1",
      },
    },
    {
      types: ["function-variable"],
      style: {
        color: "#6f42c1",
      },
    },
    {
      types: ["tag", "selector", "keyword"],
      style: {
        color: "#d73a49",
      },
    },
  ],
};

// Dark theme for syntax highlighting
export const darkSyntaxTheme = {
  plain: {
    color: "#f8f8f2",
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: {
        color: "#8292a2",
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
        color: "#a3be8c",
      },
    },
    {
      types: ["punctuation", "operator"],
      style: {
        color: "#81a1c1",
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
        color: "#b48ead",
      },
    },
    {
      types: ["atrule", "keyword", "attr-name", "selector"],
      style: {
        color: "#81a1c1",
      },
    },
    {
      types: ["function", "deleted", "tag"],
      style: {
        color: "#88c0d0",
      },
    },
    {
      types: ["function-variable"],
      style: {
        color: "#88c0d0",
      },
    },
    {
      types: ["tag", "selector", "keyword"],
      style: {
        color: "#81a1c1",
      },
    },
  ],
};

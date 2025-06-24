import type { PrismTheme } from "prism-react-renderer";

export const lightSyntaxTheme: PrismTheme = {
  plain: {
    color: "hsl(0 0% 9%)", // Darker for better contrast
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "cdata"],
      style: {
        color: "hsl(0 0% 40%)", // Darker comment color
        fontStyle: "italic",
      },
    },
    {
      types: ["doctype", "punctuation", "entity"],
      style: {
        color: "hsl(0 0% 35%)", // Darker punctuation
      },
    },
    {
      types: [
        "attr-name",
        "class-name",
        "boolean",
        "constant",
        "number",
        "atrule",
      ],
      style: {
        color: "hsl(280 70% 45%)", // Darker purple
        fontWeight: "500",
      },
    },
    {
      types: ["keyword", "property", "tag", "symbol", "deleted", "important"],
      style: {
        color: "hsl(158 65% 35%)", // Darker green
        fontWeight: "600",
      },
    },
    {
      types: [
        "selector",
        "string",
        "char",
        "builtin",
        "inserted",
        "regex",
        "attr-value",
      ],
      style: {
        color: "hsl(200 85% 45%)", // Darker blue
      },
    },
    {
      types: ["variable", "operator", "function"],
      style: {
        color: "hsl(35 90% 45%)", // Darker orange
      },
    },
    {
      types: ["url"],
      style: {
        color: "hsl(10 75% 50%)", // Darker coral
        textDecorationLine: "underline",
      },
    },
    {
      types: ["namespace"],
      style: {
        color: "hsl(55 85% 45%)", // Darker yellow
      },
    },
    {
      types: ["bracket", "delimiter"],
      style: {
        color: "hsl(0 0% 9%)", // Darker for better contrast
      },
    },
    {
      types: ["title"],
      style: {
        color: "hsl(158 65% 35%)", // Darker green
        fontWeight: "bold",
      },
    },
    {
      types: ["generic"],
      style: {
        color: "hsl(0 0% 40%)", // Darker muted color
      },
    },
  ],
};

export const darkSyntaxTheme: PrismTheme = {
  plain: {
    color: "hsl(210 40% 96%)", // Slightly dimmer for less harsh contrast
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "cdata"],
      style: {
        color: "hsl(217.9 10.6% 60%)", // Slightly dimmer
        fontStyle: "italic",
      },
    },
    {
      types: ["doctype", "punctuation", "entity"],
      style: {
        color: "hsl(217.9 10.6% 65%)", // Brighter for better visibility
      },
    },
    {
      types: [
        "attr-name",
        "class-name",
        "boolean",
        "constant",
        "number",
        "atrule",
      ],
      style: {
        color: "hsl(280 75% 70%)", // Brighter purple
        fontWeight: "500",
      },
    },
    {
      types: ["keyword", "property", "tag", "symbol", "deleted", "important"],
      style: {
        color: "hsl(158 70% 55%)", // Brighter green
        fontWeight: "600",
      },
    },
    {
      types: [
        "selector",
        "string",
        "char",
        "builtin",
        "inserted",
        "regex",
        "attr-value",
      ],
      style: {
        color: "hsl(200 90% 70%)", // Brighter blue
      },
    },
    {
      types: ["variable", "operator", "function"],
      style: {
        color: "hsl(35 95% 65%)", // Brighter orange
      },
    },
    {
      types: ["url"],
      style: {
        color: "hsl(10 80% 75%)", // Brighter coral
        textDecorationLine: "underline",
      },
    },
    {
      types: ["namespace"],
      style: {
        color: "hsl(55 90% 75%)", // Brighter yellow
      },
    },
    {
      types: ["bracket", "delimiter"],
      style: {
        color: "hsl(210 40% 96%)", // Slightly dimmer
      },
    },
    {
      types: ["title"],
      style: {
        color: "hsl(158 70% 55%)", // Brighter green
        fontWeight: "bold",
      },
    },
    {
      types: ["generic"],
      style: {
        color: "hsl(217.9 10.6% 60%)", // Slightly dimmer
      },
    },
  ],
};

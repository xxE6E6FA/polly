import { fixupPluginRules } from "@eslint/compat";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tailwindcss from "eslint-plugin-tailwindcss";
import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";

export default [
  {
    ignores: [
      "**/dist",
      "**/build",
      "**/node_modules",
      "**/.next",
      "**/convex/_generated",
      "**/*.js",
      "**/.react-router",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": fixupPluginRules(typescriptEslint),
      react: fixupPluginRules(react),
      "react-hooks": fixupPluginRules(reactHooks),
      tailwindcss: fixupPluginRules(tailwindcss),
      import: fixupPluginRules(importPlugin),
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // Essential TypeScript Rules - Help LLMs understand types and prevent runtime errors
      ...typescriptEslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error", // Forces proper typing
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // Critical React Rules - Prevent common bugs and performance issues
      "react/prop-types": "off", // TypeScript handles this
      "react/react-in-jsx-scope": "off", // Not needed in modern React
      "react/jsx-no-constructed-context-values": "error", // Performance
      "react/no-unstable-nested-components": ["error", { allowAsProps: true }], // Performance
      "react/jsx-key": "error", // Critical for React reconciliation

      // React Hooks - ESSENTIAL for React Router apps
      "react-hooks/rules-of-hooks": "error", // Prevents hook violations
      "react-hooks/exhaustive-deps": "error", // Prevents stale closures

      // Core Code Quality - High impact, low noise
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-undef": "off", // TypeScript handles this
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"], // Prevents type coercion bugs

      // Import Organization - Helps LLMs understand dependencies
      "import/order": "off", // Disable to prevent breaking CSS loading order
      "import/no-duplicates": ["error", { considerQueryString: true }],
      "import/no-cycle": ["error", { maxDepth: 3 }], // Prevents circular dependencies

      // Async/Promise handling - Critical for data loading in React Router
      "no-async-promise-executor": "error",
      "require-await": "error",

      // Tailwind CSS - Only the essential rule
      "tailwindcss/no-contradicting-classname": "error",
    },
  },
  // Override for scripts directory
  {
    files: ["scripts/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
  // Override for specific files with false positive async warnings
  {
    files: ["convex/ai/messages.ts", "convex/ai/providers.ts"],
    rules: {
      "require-await": "off", // These files have legitimate async patterns ESLint can't analyze properly
    },
  },
];

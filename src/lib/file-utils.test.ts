import { describe, expect, test } from "bun:test";
import {
  FILE_EXTENSION_TO_LANGUAGE,
  getFileLanguage,
  readFileAsBase64,
  readFileAsText,
} from "./file-utils";

describe("getFileLanguage", () => {
  test("detects JavaScript/TypeScript files", () => {
    expect(getFileLanguage("app.js")).toBe("javascript");
    expect(getFileLanguage("app.jsx")).toBe("javascript");
    expect(getFileLanguage("app.ts")).toBe("typescript");
    expect(getFileLanguage("app.tsx")).toBe("typescript");
    expect(getFileLanguage("module.mjs")).toBe("javascript");
  });

  test("detects web files", () => {
    expect(getFileLanguage("index.html")).toBe("html");
    expect(getFileLanguage("styles.css")).toBe("css");
    expect(getFileLanguage("styles.scss")).toBe("scss");
  });

  test("detects programming languages", () => {
    expect(getFileLanguage("script.py")).toBe("python");
    expect(getFileLanguage("Main.java")).toBe("java");
    expect(getFileLanguage("lib.rs")).toBe("rust");
    expect(getFileLanguage("app.go")).toBe("go");
  });

  test("detects config files", () => {
    expect(getFileLanguage("config.json")).toBe("json");
    expect(getFileLanguage("docker-compose.yml")).toBe("yaml");
    expect(getFileLanguage("Cargo.toml")).toBe("toml");
    expect(getFileLanguage("app.ini")).toBe("ini");
  });

  test("detects shell scripts", () => {
    expect(getFileLanguage("script.sh")).toBe("bash");
    expect(getFileLanguage("setup.bash")).toBe("bash");
    expect(getFileLanguage("script.ps1")).toBe("powershell");
  });

  test("detects documentation files", () => {
    expect(getFileLanguage("README.md")).toBe("markdown");
    expect(getFileLanguage("doc.mdx")).toBe("markdown");
  });

  test("returns text for unknown extensions", () => {
    expect(getFileLanguage("file.unknown")).toBe("text");
    expect(getFileLanguage("README")).toBe("text");
  });

  test("handles case insensitivity", () => {
    expect(getFileLanguage("App.JS")).toBe("javascript");
    expect(getFileLanguage("CONFIG.JSON")).toBe("json");
  });

  test("handles files without extensions", () => {
    expect(getFileLanguage("Dockerfile")).toBe("dockerfile");
    expect(getFileLanguage("Makefile")).toBe("makefile");
  });

  test("handles multiple dots in filename", () => {
    expect(getFileLanguage("my.component.spec.ts")).toBe("typescript");
    expect(getFileLanguage("app.config.json")).toBe("json");
  });
});

describe("FILE_EXTENSION_TO_LANGUAGE", () => {
  test("includes all major programming languages", () => {
    expect(FILE_EXTENSION_TO_LANGUAGE.js).toBe("javascript");
    expect(FILE_EXTENSION_TO_LANGUAGE.py).toBe("python");
    expect(FILE_EXTENSION_TO_LANGUAGE.rs).toBe("rust");
    expect(FILE_EXTENSION_TO_LANGUAGE.go).toBe("go");
  });

  test("maps multiple extensions to same language", () => {
    expect(FILE_EXTENSION_TO_LANGUAGE.cpp).toBe("cpp");
    expect(FILE_EXTENSION_TO_LANGUAGE["c++"]).toBe("cpp");
    expect(FILE_EXTENSION_TO_LANGUAGE.cc).toBe("cpp");
  });

  test("includes config formats", () => {
    expect(FILE_EXTENSION_TO_LANGUAGE.json).toBe("json");
    expect(FILE_EXTENSION_TO_LANGUAGE.yaml).toBe("yaml");
    expect(FILE_EXTENSION_TO_LANGUAGE.toml).toBe("toml");
  });
});

describe("readFileAsText", () => {
  test("reads text file using File.text() when available", async () => {
    const mockFile = new File(["Hello World"], "test.txt", {
      type: "text/plain",
    });

    const content = await readFileAsText(mockFile);
    expect(content).toBe("Hello World");
  });

  test("handles empty files", async () => {
    const mockFile = new File([""], "empty.txt", { type: "text/plain" });

    const content = await readFileAsText(mockFile);
    expect(content).toBe("");
  });

  test("handles multi-line text", async () => {
    const mockFile = new File(["Line 1\nLine 2\nLine 3"], "multi.txt", {
      type: "text/plain",
    });

    const content = await readFileAsText(mockFile);
    expect(content).toBe("Line 1\nLine 2\nLine 3");
  });
});

describe("readFileAsBase64", () => {
  test("converts file to base64", async () => {
    const mockFile = new File(["Test content"], "test.txt", {
      type: "text/plain",
    });

    const base64 = await readFileAsBase64(mockFile);

    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(base64).not.toContain("data:");
    expect(base64).not.toContain("base64,");
  });

  test("handles different file types", async () => {
    const jsonFile = new File(['{"key": "value"}'], "data.json", {
      type: "application/json",
    });

    const base64 = await readFileAsBase64(jsonFile);

    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
  });

  test("handles empty files", async () => {
    const emptyFile = new File([" "], "empty.txt", { type: "text/plain" });

    const base64 = await readFileAsBase64(emptyFile);

    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
  });
});

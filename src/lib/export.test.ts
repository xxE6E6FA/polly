import { beforeEach, describe, expect, test } from "bun:test";
import type { ExportData } from "@/types";
import {
  mockGlobalFetchOnce,
  stubAnchorClicks,
  withMockedURLObjectURL,
} from "../test/utils";

type ExportModule = typeof import("./export");
let exportModule: ExportModule;
let exportAsJSONFn: ExportModule["exportAsJSON"];
let exportAsMarkdownFn: ExportModule["exportAsMarkdown"];
let generateFilenameFn: ExportModule["generateFilename"];
let downloadFileFn: ExportModule["downloadFile"];
let downloadFromUrlFn: ExportModule["downloadFromUrl"];

function unwrapMockedFunction<T extends (...args: any[]) => unknown>(fn: T): T {
  const maybeMock = fn as unknown as { mock?: { original?: unknown } };
  if (maybeMock.mock?.original) {
    return maybeMock.mock.original as T;
  }
  return fn;
}

beforeEach(async () => {
  // Ensure we get an unmocked copy even if another spec has mocked the module
  const modulePath = "./export?isolated-tests";
  exportModule = (await import(modulePath)) as ExportModule;
  exportAsJSONFn = unwrapMockedFunction(exportModule.exportAsJSON);
  exportAsMarkdownFn = unwrapMockedFunction(exportModule.exportAsMarkdown);
  generateFilenameFn = unwrapMockedFunction(exportModule.generateFilename);
  downloadFileFn = unwrapMockedFunction(exportModule.downloadFile);
  downloadFromUrlFn = unwrapMockedFunction(exportModule.downloadFromUrl);
});

describe("export", () => {
  test("exportAsJSON throws without conversation", () => {
    // @ts-expect-error intentionally invalid to assert runtime error
    expect(() => exportAsJSONFn({})).toThrow(/Conversation data is required/);
  });

  test("exportAsJSON strips citations and formats dates", () => {
    const data = {
      conversation: {
        title: "Test Conversation",
        createdAt: 1700000000000,
        updatedAt: 1700001000000,
      },
      messages: [
        {
          role: "user",
          content: "Hello [1] world [2]",
          createdAt: 1700000001000,
        },
        {
          role: "assistant",
          content: "Reply [3] with link [4]",
          reasoning: "Thinking [1][2] details",
          model: "gpt-4o",
          provider: "openai",
          useWebSearch: true,
          attachments: [],
          citations: [],
          createdAt: 1700000002000,
          metadata: { tokenCount: 10 },
        },
      ],
    } as ExportData;

    const json = exportAsJSONFn(data);
    const parsed = JSON.parse(json);

    expect(parsed.conversation.title).toBe("Test Conversation");
    expect(parsed.conversation.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.messages[0].content).toBe("Hello world");
    expect(parsed.messages[1].content).toBe("Reply with link");
    expect(parsed.messages[1].reasoning).toBe("Thinking details");
    expect(parsed.messages[1].model).toBe("gpt-4o");
    expect(parsed.messages[1].provider).toBe("openai");
  });

  test("exportAsMarkdown includes roles, metadata, attachments and sources, skipping system/context", () => {
    const data = {
      conversation: {
        title: "Markdown Export ✨",
        createdAt: 1700000000000,
        updatedAt: 1700001000000,
      },
      messages: [
        { role: "system", content: "ignored", createdAt: 1700000000001 },
        { role: "context", content: "ignored", createdAt: 1700000000002 },
        {
          role: "user",
          content: "Question [1] here",
          createdAt: 1700000001000,
          attachments: [{ name: "file.pdf", type: "pdf" }],
        },
        {
          role: "assistant",
          content: "Answer [2] text",
          reasoning: "Steps [1][2] done",
          model: "gpt-4o",
          provider: "openai",
          createdAt: 1700000002000,
          citations: [
            { title: "Site A", url: "https://a.example" },
            { title: "Site B", url: "https://b.example", snippet: "Snippet" },
          ],
        },
      ],
    } as ExportData;

    const md = exportAsMarkdownFn(data);
    // Title and separators
    expect(md).toMatch(/^# Markdown Export/);
    expect(md).toContain("---");
    // User section
    expect(md).toMatch(/## .*User/);
    expect(md).toContain("**Attachments:**");
    expect(md).toContain("file.pdf");
    expect(md).toContain("pdf");
    expect(md).toContain("Question here");
    expect(md).not.toContain("[1]");
    // Assistant section with model and sources
    expect(md).toMatch(/## .*Assistant/);
    expect(md).toContain("**Model:**");
    expect(md).toContain("gpt-4o");
    expect(md).toContain("openai");
    expect(md).toContain("### Reasoning");
    expect(md).toContain("Steps done");
    expect(md).not.toContain("[1][2]");
    expect(md).toContain("**Sources:**");
    expect(md).toContain("Site A");
    expect(md).toContain("Site B");
    expect(md).toContain("https://a.example");
    expect(md).toContain("https://b.example");
    expect(md).toContain("Snippet");
    // System/context are skipped
    expect(md).not.toContain("ignored");
  });

  test("generateFilename sanitizes and appends date + extension", () => {
    const name = generateFilenameFn("Hello, World! — Test", "md");
    expect(name).toMatch(/^hello-world-test-\d{4}-\d{2}-\d{2}\.md$/);

    const nameJson = generateFilenameFn("Another_Title(1)", "json");
    expect(nameJson).toMatch(/^anothertitle1-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test("downloadFile creates link, clicks it, and revokes URL", () => {
    const url = withMockedURLObjectURL();
    const a = stubAnchorClicks();
    downloadFileFn("content", "file.txt", "text/plain");
    expect(url.createSpy).toHaveBeenCalled();
    expect(a.createSpy).toHaveBeenCalledWith("a");
    expect(a.appendSpy).toHaveBeenCalledWith(a.anchor);
    expect(a.clickSpy).toHaveBeenCalled();
    expect(a.removeSpy).toHaveBeenCalledWith(a.anchor);
    expect(url.revokeSpy).toHaveBeenCalledWith("blob:mock");
    a.restore();
    url.restore();
  });

  test("downloadFromUrl fetches, creates link, clicks, and revokes URL", async () => {
    const fakeBlob = new Blob(["x"], { type: "text/plain" });
    const { restore } = mockGlobalFetchOnce({
      ok: true,
      blob: async () => fakeBlob,
    });
    const url = withMockedURLObjectURL();
    const a = stubAnchorClicks();
    await downloadFromUrlFn("https://example.com/file.txt", "file.txt");
    expect(url.createSpy).toHaveBeenCalled();
    expect(a.clickSpy).toHaveBeenCalled();
    expect(url.revokeSpy).toHaveBeenCalledWith("blob:mock");
    a.restore();
    url.restore();
    restore();
  });
});

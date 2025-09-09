import { describe, expect, it, vi } from "vitest";
import {
  mockGlobalFetchOnce,
  stubAnchorClicks,
  withMockedURLObjectURL,
} from "../test/utils";
import {
  downloadFile,
  downloadFromUrl,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "./export";

describe("export", () => {
  it("exportAsJSON throws without conversation", () => {
    // @ts-expect-error intentionally invalid to assert runtime error
    expect(() => exportAsJSON({})).toThrow(/Conversation data is required/);
  });

  it("exportAsJSON strips citations and formats dates", () => {
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
    };

    const json = exportAsJSON(data);
    const parsed = JSON.parse(json);

    expect(parsed.conversation.title).toBe("Test Conversation");
    expect(parsed.conversation.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.messages[0].content).toBe("Hello world");
    expect(parsed.messages[1].content).toBe("Reply with link");
    expect(parsed.messages[1].reasoning).toBe("Thinking details");
    expect(parsed.messages[1].model).toBe("gpt-4o");
    expect(parsed.messages[1].provider).toBe("openai");
  });

  it("exportAsMarkdown includes roles, metadata, attachments and sources, skipping system/context", () => {
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
    };

    const md = exportAsMarkdown(data);
    // Title and separators
    expect(md).toMatch(/^# Markdown Export/);
    expect(md).toContain("---\n\n");
    // User section
    expect(md).toMatch(/## 👤 User/);
    expect(md).toContain("**Attachments:**\n- file.pdf (pdf)");
    expect(md).toContain("Question here");
    // Assistant section with model and sources
    expect(md).toMatch(/## 🤖 Assistant/);
    expect(md).toContain("**Model:** gpt-4o (openai)");
    expect(md).toContain("### Reasoning\n\nSteps done");
    expect(md).toContain(
      "**Sources:**\n1. [Site A](https://a.example)\n2. [Site B](https://b.example)\n   > Snippet"
    );
    // System/context are skipped
    expect(md).not.toContain("ignored");
  });

  it("generateFilename sanitizes and appends date + extension", () => {
    const name = generateFilename("Hello, World! — Test", "md");
    expect(name).toMatch(/^hello-world-test-\d{4}-\d{2}-\d{2}\.md$/);

    const nameJson = generateFilename("Another_Title(1)", "json");
    expect(nameJson).toMatch(/^anothertitle1-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("downloadFile creates link, clicks it, and revokes URL", () => {
    const url = withMockedURLObjectURL();
    const a = stubAnchorClicks();
    downloadFile("content", "file.txt", "text/plain");
    expect(url.createSpy).toHaveBeenCalled();
    expect(a.createSpy).toHaveBeenCalledWith("a");
    expect(a.appendSpy).toHaveBeenCalledWith(a.anchor);
    expect(a.clickSpy).toHaveBeenCalled();
    expect(a.removeSpy).toHaveBeenCalledWith(a.anchor);
    expect(url.revokeSpy).toHaveBeenCalledWith("blob:mock");
    a.restore();
    url.restore();
  });

  it("downloadFromUrl fetches, creates link, clicks, and revokes URL", async () => {
    const fakeBlob = new Blob(["x"], { type: "text/plain" });
    const { restore } = mockGlobalFetchOnce({
      ok: true,
      blob: async () => fakeBlob,
    });
    const url = withMockedURLObjectURL();
    const a = stubAnchorClicks();
    await downloadFromUrl("https://example.com/file.txt", "file.txt");
    expect(url.createSpy).toHaveBeenCalled();
    expect(a.clickSpy).toHaveBeenCalled();
    expect(url.revokeSpy).toHaveBeenCalledWith("blob:mock");
    a.restore();
    url.restore();
    restore();
  });
});

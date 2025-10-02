import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile, downloadFromUrl, generateFilename } from "./export";

describe("export helpers (DOM)", () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn<any, any>>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn<any, any>>;
  let appendSpy: ReturnType<typeof vi.spyOn<any, any>>;
  let removeSpy: ReturnType<typeof vi.spyOn<any, any>>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Ensure URL methods exist under jsdom
    if (
      !(URL as unknown as { createObjectURL?: typeof URL.createObjectURL })
        .createObjectURL
    ) {
      (
        URL as unknown as { createObjectURL: typeof URL.createObjectURL }
      ).createObjectURL = () => "blob:mock";
    }
    if (
      !(URL as unknown as { revokeObjectURL?: typeof URL.revokeObjectURL })
        .revokeObjectURL
    ) {
      (
        URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }
      ).revokeObjectURL = () => {
        /* noop */
      };
    }

    createObjectURLSpy = vi
      .spyOn(
        URL as unknown as { createObjectURL: typeof URL.createObjectURL },
        "createObjectURL"
      )
      .mockReturnValue("blob:abc");
    revokeObjectURLSpy = vi
      .spyOn(
        URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL },
        "revokeObjectURL"
      )
      .mockImplementation(() => {
        /* noop */
      });
    appendSpy = vi.spyOn(document.body, "appendChild");
    removeSpy = vi.spyOn(document.body, "removeChild");
    clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    // Wrap createElement to inject a spyable click on anchor nodes
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string
    ) => {
      const el = origCreate(tagName) as HTMLAnchorElement;
      if (String(tagName).toLowerCase() === "a") {
        (el as unknown as { click: () => void }).click =
          clickSpy as unknown as () => void;
      }
      return el as unknown as HTMLElement;
    }) as unknown as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloadFile creates and clicks a link, revokes URL", () => {
    downloadFile("content", "file.txt", "text/plain");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:abc");
  });

  it("downloadFromUrl fetches and triggers download", async () => {
    const blob = new Blob(["x"], { type: "text/plain" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => blob,
    } as Response);
    await downloadFromUrl("/x", "f.txt");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("downloadFromUrl throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    await expect(downloadFromUrl("/err", "f.txt")).rejects.toThrow(/500/);
  });

  it("generateFilename sanitizes and appends date", () => {
    const name = generateFilename("Hello/World!", "md");
    expect(name.endsWith(".md")).toBe(true);
    // Slash is stripped (no hyphen inserted), spaces mapped to hyphens
    expect(name).toMatch(/^helloworld-\d{4}-\d{2}-\d{2}\.md$/);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { FileUploadProgress } from "@/types";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@/lib/file-utils", () => ({ generateThumbnail: vi.fn() }));

import { useMutation } from "convex/react";
import { generateThumbnail } from "@/lib/file-utils";
import { useConvexFileUpload } from "./use-convex-file-upload";

describe("useConvexFileUpload", () => {
  it("uploads image and returns attachment with thumbnail and progress updates", async () => {
    (useMutation as unknown as vi.Mock).mockReturnValue(
      async () => "https://upload.example"
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "sid" }),
      }) as unknown as typeof fetch;
    (generateThumbnail as unknown as vi.Mock).mockResolvedValue(
      "data:image/jpeg;base64,THUMB"
    );

    const progress: FileUploadProgress[] = [];
    const file = new File([new Uint8Array([1, 2])], "img.png", {
      type: "image/png",
    });
    const { result } = renderHook(() => useConvexFileUpload());
    const att = await result.current.uploadFile(file, p =>
      progress.push({ ...p })
    );
    expect(att).toMatchObject({
      type: "image",
      name: "img.png",
      storageId: "sid",
      thumbnail: "data:image/jpeg;base64,THUMB",
    });
    expect(progress.at(-1).status).toBe("complete");
  });

  it("uploads text and returns attachment with content", async () => {
    (useMutation as unknown as vi.Mock).mockReturnValue(
      async () => "https://upload.example"
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "sid" }),
      }) as unknown as typeof fetch;
    const text = new File(["hello"], "a.txt", { type: "text/plain" });
    const { result } = renderHook(() => useConvexFileUpload());
    const att = await result.current.uploadFile(text);
    expect(att).toMatchObject({ type: "text", content: "hello" });
  });

  it("throws and reports error on upload failure", async () => {
    (useMutation as unknown as vi.Mock).mockReturnValue(
      async () => "https://upload.example"
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        statusText: "Bad",
      }) as unknown as typeof fetch;
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    const { result } = renderHook(() => useConvexFileUpload());
    await expect(result.current.uploadFile(file)).rejects.toThrow(
      /Upload failed/
    );
  });
});

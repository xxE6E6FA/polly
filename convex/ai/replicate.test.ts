import { describe, expect, mock, test, afterEach } from "bun:test";
import { resolveImageUrlsFromAttachments } from "./replicate";

// Tiny 1x1 red PNG as raw bytes (67 bytes)
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const TINY_PNG_BASE64 = Buffer.from(TINY_PNG_BYTES).toString("base64");

/**
 * Create a mock storageGetUrl function.
 * By default resolves to a Convex-style storage URL (no file extension).
 */
function mockStorageGetUrl(url: string | null = "https://example.convex.cloud/api/storage/abc123") {
  return mock(() => Promise.resolve(url));
}

/** Stub global fetch for storage URL fetches. */
function stubFetch(
  body: ArrayBuffer | Uint8Array = TINY_PNG_BYTES,
  contentType = "image/png",
  ok = true,
) {
  const original = globalThis.fetch;
  const stub = mock(() =>
    Promise.resolve(
      new Response(ok ? body : null, {
        status: ok ? 200 : 500,
        headers: { "content-type": contentType },
      }),
    ),
  globalThis.fetch = stub as unknown as typeof globalThis.fetch;
  globalThis.fetch = stub as unknown as unknown as typeof globalThis.fetch;
  return { stub, restore: () => { globalThis.fetch = original; } };
}

describe("resolveImageUrlsFromAttachments", () => {
  let fetchCleanup: { restore: () => void } | null = null;

  afterEach(() => {
    fetchCleanup?.restore();
    fetchCleanup = null;
  });

  describe("empty / invalid inputs", () => {
    test("returns empty array for undefined attachments", async () => {
      const result = await resolveImageUrlsFromAttachments(undefined, mockStorageGetUrl());
      expect(result).toEqual([]);
    });

    test("returns empty array for empty array", async () => {
      const result = await resolveImageUrlsFromAttachments([], mockStorageGetUrl());
      expect(result).toEqual([]);
    });

    test("returns empty array for null", async () => {
      const result = await resolveImageUrlsFromAttachments(null as any, mockStorageGetUrl());
      expect(result).toEqual([]);
    });

    test("skips null entries in attachments", async () => {
      const result = await resolveImageUrlsFromAttachments(
        [null, undefined],
        mockStorageGetUrl(),
      );
      expect(result).toEqual([]);
    });

    test("skips non-image attachments", async () => {
      const result = await resolveImageUrlsFromAttachments(
        [
          { type: "pdf", url: "https://example.com/doc.pdf", storageId: "s1" },
          { type: "text", url: "hello", storageId: "s2" },
        ],
        mockStorageGetUrl(),
      );
      expect(result).toEqual([]);
    });
  });

  describe("storageId → data URI conversion", () => {
    test("converts storage-backed image to data URI with attachment mimeType", async () => {
      const { stub } = fetchCleanup = stubFetch(TINY_PNG_BYTES, "image/png");
      const getUrl = mockStorageGetUrl("https://example.convex.cloud/api/storage/abc123");

      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://example.convex.cloud/api/storage/abc123", storageId: "s1", mimeType: "image/webp" }],
        getUrl,
      );

      expect(result).toHaveLength(1);
      // Prefers attachment mimeType over response Content-Type
      expect(result[0]).toBe(`data:image/webp;base64,${TINY_PNG_BASE64}`);
      expect(getUrl).toHaveBeenCalledTimes(1);
      expect(stub).toHaveBeenCalledTimes(1);
    });

    test("falls back to response Content-Type when mimeType is missing", async () => {
      fetchCleanup = stubFetch(TINY_PNG_BYTES, "image/png");

      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://example.convex.cloud/api/storage/abc123", storageId: "s1" }],
        mockStorageGetUrl(),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
    });

    test("falls back to image/jpeg when no mimeType and no Content-Type", async () => {
      const original = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(TINY_PNG_BYTES, {
            status: 200,
            // No content-type header
          }),
        ),
      ) as unknown as typeof globalThis.fetch;
      fetchCleanup = { restore: () => { globalThis.fetch = original; } };

      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://storage.example/abc", storageId: "s1" }],
        mockStorageGetUrl("https://storage.example/abc"),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toStartWith("data:image/jpeg;base64,");
    });

    test("handles jpeg mimeType from generated image", async () => {
      fetchCleanup = stubFetch(TINY_PNG_BYTES, "application/octet-stream");

      const result = await resolveImageUrlsFromAttachments(
        [{
          type: "image",
          url: "https://example.convex.cloud/api/storage/xyz",
          storageId: "s1",
          mimeType: "image/jpeg",
          generatedImage: { isGenerated: true, source: "replicate", model: "flux" },
        }],
        mockStorageGetUrl("https://example.convex.cloud/api/storage/xyz"),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toStartWith("data:image/jpeg;base64,");
    });
  });

  describe("fallback to att.url", () => {
    test("uses att.url when storageGetUrl returns null", async () => {
      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://replicate.delivery/image.png", storageId: "s1" }],
        mockStorageGetUrl(null),
      );

      expect(result).toEqual(["https://replicate.delivery/image.png"]);
    });

    test("uses att.url when fetch fails", async () => {
      fetchCleanup = stubFetch(new Uint8Array(), "image/png", false);

      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://replicate.delivery/image.png", storageId: "s1" }],
        mockStorageGetUrl(),
      );

      expect(result).toEqual(["https://replicate.delivery/image.png"]);
    });

    test("uses att.url when fetch throws", async () => {
      const original = globalThis.fetch;
      globalThis.fetch = mock(() => Promise.reject(new Error("Network error"))) as unknown as typeof globalThis.fetch;
      fetchCleanup = { restore: () => { globalThis.fetch = original; } };

      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://replicate.delivery/image.png", storageId: "s1" }],
        mockStorageGetUrl(),
      );

      expect(result).toEqual(["https://replicate.delivery/image.png"]);
    });

    test("uses att.url when no storageId", async () => {
      const getUrl = mockStorageGetUrl();

      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "https://replicate.delivery/output.png" }],
        getUrl,
      );

      expect(result).toEqual(["https://replicate.delivery/output.png"]);
      expect(getUrl).not.toHaveBeenCalled();
    });

    test("skips attachment when no storageId and url is empty", async () => {
      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "" }],
        mockStorageGetUrl(),
      );

      expect(result).toEqual([]);
    });

    test("skips attachment when no storageId and url is whitespace", async () => {
      const result = await resolveImageUrlsFromAttachments(
        [{ type: "image", url: "   " }],
        mockStorageGetUrl(),
      );

      expect(result).toEqual([]);
    });
  });

  describe("multiple attachments", () => {
    test("resolves multiple images independently", async () => {
      let callCount = 0;
      const original = globalThis.fetch;
      globalThis.fetch = mock(() => {
        callCount++;
        return Promise.resolve(
          new Response(TINY_PNG_BYTES, {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        );
      }) as unknown as typeof globalThis.fetch;
      fetchCleanup = { restore: () => { globalThis.fetch = original; } };

      const result = await resolveImageUrlsFromAttachments(
        [
          { type: "image", url: "https://storage/a", storageId: "s1", mimeType: "image/png" },
          { type: "pdf", url: "https://storage/b", storageId: "s2" },
          { type: "image", url: "https://replicate.delivery/c.jpg" },
        ],
        mockStorageGetUrl("https://storage/a"),
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toStartWith("data:image/png;base64,");
      expect(result[1]).toBe("https://replicate.delivery/c.jpg");
    });

    test("handles mix of success and failure per attachment", async () => {
      let callCount = 0;
      const original = globalThis.fetch;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(TINY_PNG_BYTES, {
              status: 200,
              headers: { "content-type": "image/png" },
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 500 }));
      }) as unknown as typeof globalThis.fetch;
      fetchCleanup = { restore: () => { globalThis.fetch = original; } };

      const getUrl = mock((id: any) => {
        if (id === "s1") {
          return Promise.resolve("https://storage/a");
        }
        return Promise.resolve("https://storage/b");
      });

      const result = await resolveImageUrlsFromAttachments(
        [
          { type: "image", url: "https://fallback-a.jpg", storageId: "s1", mimeType: "image/png" },
          { type: "image", url: "https://fallback-b.jpg", storageId: "s2", mimeType: "image/jpeg" },
        ],
        getUrl,
      );

      expect(result).toHaveLength(2);
      // First succeeds → data URI
      expect(result[0]).toStartWith("data:image/png;base64,");
      // Second fetch fails → falls back to att.url
      expect(result[1]).toBe("https://fallback-b.jpg");
    });
  });
});

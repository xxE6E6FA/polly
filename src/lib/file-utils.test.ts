import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installCanvasMock,
  installFileReaderSequence,
  installImageMock,
  withMockedURLObjectURL,
} from "../test/utils";
import {
  convertImageToWebP,
  generateThumbnail,
  getFileLanguage,
  readFileAsBase64,
  readFileAsText,
} from "./file-utils";

describe("file-utils", () => {
  const RealFileReader = global.FileReader;
  const RealImage = global.Image;

  afterEach(() => {
    vi.restoreAllMocks();
    global.FileReader = RealFileReader;
    global.Image = RealImage;
  });

  it("readFileAsText reads text file", async () => {
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    await expect(readFileAsText(file)).resolves.toBe("hello");
  });

  it("readFileAsBase64 reads file to base64 without prefix", async () => {
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    const base64 = await readFileAsBase64(file);
    expect(base64).toBe("aGVsbG8="); // "hello"
  });

  it("getFileLanguage maps known extensions and defaults to text", () => {
    expect(getFileLanguage("script.tsx")).toBe("typescript");
    expect(getFileLanguage("index.HTML")).toBe("html");
    expect(getFileLanguage("unknown.ext")).toBe("text");
    expect(getFileLanguage("Makefile")).toBe("makefile");
  });

  it("convertImageToWebP converts and returns base64+mime", async () => {
    installImageMock({ width: 2000, height: 1000 });
    installCanvasMock();
    installFileReaderSequence([
      "data:image/png;base64,AAAA",
      "data:image/webp;base64,XYZ",
    ]);
    const file = new File(["x"], "img.png", { type: "image/png" });
    const res = await convertImageToWebP(file);
    expect(res).toEqual({ base64: "XYZ", mimeType: "image/webp" });
  });

  it("convertImageToWebP rejects when canvas context missing", async () => {
    installImageMock();
    installCanvasMock({ hasContext: false });
    installFileReaderSequence(["data:image/png;base64,AAAA"]);
    const file = new File(["x"], "img.png", { type: "image/png" });
    await expect(convertImageToWebP(file)).rejects.toThrow(
      /Failed to get canvas context/
    );
  });

  it("convertImageToWebP rejects when toBlob yields null", async () => {
    installImageMock();
    installCanvasMock({ toBlobReturnsNull: true });
    installFileReaderSequence(["data:image/png;base64,AAAA"]);
    const file = new File(["x"], "img.png", { type: "image/png" });
    await expect(convertImageToWebP(file)).rejects.toThrow(
      /Failed to convert image/
    );
  });

  it("convertImageToWebP rejects when blob FileReader errors", async () => {
    installImageMock();
    installCanvasMock();
    installFileReaderSequence([
      "data:image/png;base64,AAAA",
      new Error("blob read error"),
    ]);
    const file = new File(["x"], "img.png", { type: "image/png" });
    await expect(convertImageToWebP(file)).rejects.toThrow(
      /Failed to read converted image/
    );
  });

  it("convertImageToWebP rejects on image load error", async () => {
    installFileReaderSequence(["data:image/png;base64,AAAA"]);
    installImageMock({ error: true });

    const file = new File(["x"], "img.png", { type: "image/png" });
    await expect(convertImageToWebP(file)).rejects.toThrow(
      /Failed to load image/
    );
  });

  it("generateThumbnail renders and returns data URL", async () => {
    installImageMock({ width: 1000, height: 500 });
    installCanvasMock({ dataUrl: "data:image/jpeg;base64,THUMB" });
    withMockedURLObjectURL();

    const file = new File(["x"], "img.png", { type: "image/png" });
    const result = await generateThumbnail(file);
    expect(result).toBe("data:image/jpeg;base64,THUMB");
  });

  it("generateThumbnail rejects when canvas context missing", async () => {
    installImageMock({ width: 100, height: 50 });
    installCanvasMock({ hasContext: false });
    withMockedURLObjectURL();

    const file = new File(["x"], "img.png", { type: "image/png" });
    await expect(generateThumbnail(file)).rejects.toThrow(
      /Failed to get canvas context/
    );
  });
});

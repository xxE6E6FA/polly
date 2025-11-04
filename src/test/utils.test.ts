import { describe, expect, test } from "bun:test";
import { makeFileList, mockGlobalFetchSequence } from "./utils";

describe("test utils", () => {
  test("makeFileList creates a FileList-like with item() and length", () => {
    const f1 = new File(["a"], "a.txt", { type: "text/plain" });
    const f2 = new File(["b"], "b.txt", { type: "text/plain" });
    const fl = makeFileList([f1, f2]);
    expect(fl.length).toBe(2);
    expect(fl.item(0)).toBe(f1);
    expect(fl.item(1)).toBe(f2);
    expect(fl.item(2)).toBeNull();
  });

  test("mockGlobalFetchSequence resolves sequential responses", async () => {
    const { restore } = mockGlobalFetchSequence([
      { ok: true, status: 200, text: async () => "first" },
      {
        ok: true,
        status: 200,
        text: async () => "second",
      },
    ]);
    const r1 = await fetch("/a");
    const r2 = await fetch("/b");
    expect(await r1.text()).toBe("first");
    expect(await r2.text()).toBe("second");
    restore();
  });
});

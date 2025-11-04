import { describe, expect, test } from "bun:test";
import { setupZustandTestStore } from "@/test/zustand";
import {
  createStreamOverlaysStore,
  setStreamOverlaysStoreApi,
  useStreamOverlays,
} from "./stream-overlays";

setupZustandTestStore({
  createStore: () => createStreamOverlaysStore(),
  setStore: setStreamOverlaysStoreApi,
});

describe("stores/stream-overlays", () => {
  test("manages overlays and reasoning overlays", () => {
    const s = useStreamOverlays.getState();
    s.set("m1", "Hello");
    s.append("m1", " World");
    expect(useStreamOverlays.getState().overlays["m1"]).toBe("Hello World");
    s.clear("m1");
    expect(useStreamOverlays.getState().overlays["m1"]).toBeUndefined();

    s.setReasoning("m2", "Think");
    s.appendReasoning("m2", " more");
    expect(useStreamOverlays.getState().reasoning["m2"]).toBe("Think more");
    s.clearReasoning("m2");
    expect(useStreamOverlays.getState().reasoning["m2"]).toBeUndefined();
  });

  test("manages status, tools, and citations", () => {
    const s = useStreamOverlays.getState();
    // Clear no-op on missing keys
    s.clearStatus("missing");
    s.clearTools("missing");
    s.clearCitations("missing");
    s.setStatus("m3", "loading");
    expect(useStreamOverlays.getState().status["m3"]).toBe("loading");
    s.clearStatus("m3");
    expect(useStreamOverlays.getState().status["m3"]).toBeUndefined();

    s.pushToolEvent("m4", { t: "tool_call", name: "search", args: { q: "x" } });
    s.pushToolEvent("m4", {
      t: "tool_result",
      name: "search",
      ok: true,
      count: 2,
    });
    expect(useStreamOverlays.getState().tools["m4"]).toHaveLength(2);
    s.clearTools("m4");
    expect(useStreamOverlays.getState().tools["m4"]).toBeUndefined();

    s.setCitations("m5", [{ url: "https://a", title: "A" }]);
    expect(useStreamOverlays.getState().citations["m5"]).toEqual([
      { url: "https://a", title: "A" },
    ]);
    s.clearCitations("m5");
    expect(useStreamOverlays.getState().citations["m5"]).toBeUndefined();
  });
});

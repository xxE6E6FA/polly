import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "./logger";

const originalProcess: any = globalThis.process;

describe("convex/lib/logger", () => {
  let debugSpy: any;
  let infoSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // restore process to avoid leaking env across tests
    if (originalProcess) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).process = originalProcess;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).process;
    }
  });

  it("logs all levels in development (convex.dev)", () => {
    // simulate development environment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process = { env: { CONVEX_CLOUD_URL: "https://xyz.convex.dev" } };

    log.debug("d", { a: 1 });
    log.info("i", "x");
    log.warn("w");
    log.error("e", new Error("boom"));

    // stream helpers
    log.streamStart("m", "prov", "message-12345678");
    log.streamReasoning("message-abcdef12", "x".repeat(100));
    log.streamComplete("message-aaaa1111", 5, 123);
    log.streamError("oops", new Error("bad"));
    log.streamAbort("user canceled");

    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("suppresses debug/info in production, keeps warn/error", () => {
    // simulate production environment (no convex.dev or localhost)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process = { env: { CONVEX_CLOUD_URL: "https://app.example.com" } };

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("treats missing process as production (no crash)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).process;
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});


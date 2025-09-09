import { vi } from "vitest";

/**
 * Create a ReadableStream of NDJSON-encoded chunks for streaming tests.
 */
export function makeNdjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) {
        controller.enqueue(enc.encode(l.endsWith("\n") ? l : `${l}\n`));
      }
      controller.close();
    },
  });
}

/** Flush pending microtasks in streaming tests. */
export async function flushPromises(times = 2): Promise<void> {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/**
 * Flush microtasks and optionally advance fake timers in one go.
 * - microtasks: how many Promise ticks to await (default 2)
 * - timersMs: if > 0 and fake timers are active, advances by this amount
 */
export async function flushAll({
  microtasks = 2,
  timersMs = 0,
}: {
  microtasks?: number;
  timersMs?: number;
} = {}) {
  await flushPromises(microtasks);
  // Try to advance timers if running under fake timers
  const maybeAdvance = (
    vi as unknown as { advanceTimersByTime?: (ms: number) => void }
  ).advanceTimersByTime;
  if (timersMs > 0 && typeof maybeAdvance === "function") {
    maybeAdvance(timersMs);
    // Allow any follow-up microtasks to settle
    await flushPromises(1);
  }
}

/**
 * Mock global fetch once. Returns the spy for further assertions and a restore helper.
 */
export function mockGlobalFetchOnce(response: Partial<Response>): {
  spy: unknown;
  restore: () => void;
} {
  // Minimal headers shim
  const headers = {
    get: (k: string) =>
      (response.headers as unknown as Headers)?.get?.(k) ??
      (response as unknown as { headers?: Record<string, string> })?.headers?.[
        k
      ] ??
      "",
  };
  const res = {
    ok: true,
    status: 200,
    text: async () => "",
    blob: async () => new Blob([]),
    body: undefined,
    ...response,
    headers,
  } as Response;
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(res);
  return { spy, restore: () => spy.mockRestore() };
}

/**
 * Mock global fetch with a sequence of responses. Each call to fetch resolves the next response.
 */
export function mockGlobalFetchSequence(responses: Partial<Response>[]): {
  spy: unknown;
  restore: () => void;
} {
  const spy = vi.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const headers = {
      get: (k: string) =>
        (r.headers as unknown as Headers)?.get?.(k) ??
        (r as unknown as { headers?: Record<string, string> })?.headers?.[k] ??
        "",
    };
    const res = {
      ok: true,
      status: 200,
      text: async () => "",
      blob: async () => new Blob([]),
      body: undefined,
      ...r,
      headers,
    } as Response;
    spy.mockResolvedValueOnce(res);
  }
  return { spy, restore: () => spy.mockRestore() };
}

/**
 * Mock fetch to stream NDJSON from an array of strings or objects.
 * Strings are passed through; objects are JSON.stringified.
 */
export function mockFetchNDJSON(
  chunks: Array<string | object>,
  init: Partial<Response> = {}
) {
  const lines = chunks.map(
    c =>
      (typeof c === "string" ? c : JSON.stringify(c)) +
      (String(c).endsWith("\n") ? "" : "\n")
  );
  const stream = makeNdjsonStream(lines);
  return mockGlobalFetchOnce({
    ok: true,
    headers: { get: () => "application/x-ndjson" } as unknown as Headers,
    body: stream,
    ...init,
  });
}

/**
 * Polyfill and spy on URL.createObjectURL/revokeObjectURL.
 */
export function withMockedURLObjectURL() {
  if (!URL.createObjectURL) {
    (
      URL as unknown as { createObjectURL: typeof URL.createObjectURL }
    ).createObjectURL = vi.fn();
  }
  if (!URL.revokeObjectURL) {
    (
      URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }
    ).revokeObjectURL = vi.fn();
  }
  const createSpy = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:mock");
  const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
    // Mock implementation for revokeObjectURL
  });
  return {
    createSpy,
    revokeSpy,
    restore: () => {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    },
  };
}

/**
 * Stub anchor creation/clicks to avoid jsdom navigation warnings.
 */
export function stubAnchorClicks() {
  const a = document.createElement("a");
  const clickSpy = vi.spyOn(a, "click").mockImplementation(() => {
    // Mock implementation for anchor click
  });
  const createSpy = vi
    .spyOn(document, "createElement")
    .mockImplementation(tag =>
      tag === "a"
        ? (a as HTMLAnchorElement)
        : document.createElement(tag as keyof HTMLElementTagNameMap)
    );
  const appendSpy = vi.spyOn(document.body, "appendChild");
  const removeSpy = vi.spyOn(document.body, "removeChild");
  return {
    anchor: a,
    clickSpy,
    createSpy,
    appendSpy,
    removeSpy,
    restore: () => {
      clickSpy.mockRestore();
      createSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    },
  };
}

/**
 * Install a simple FileReader mock that triggers onload with a given result for readAsDataURL.
 */
export function installFileReaderDataURLMock(result: string) {
  const Real = global.FileReader;
  class FRMock {
    onload: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    result: string | ArrayBuffer | null = null;
    readAsDataURL(_input: Blob) {
      this.result = result;
      setTimeout(() => this.onload?.({ target: this }), 0);
    }
    readAsText(_input: Blob) {
      this.result = result;
      setTimeout(() => this.onload?.({ target: this }), 0);
    }
  }
  global.FileReader = FRMock as unknown as typeof FileReader;
  return {
    restore: () => {
      global.FileReader = Real;
    },
  };
}

/**
 * Install a FileReader mock that yields a sequence of results across calls.
 * Each entry in the sequence may be a string (delivered via onload) or an Error (delivered via onerror).
 */
export function installFileReaderSequence(sequence: Array<string | Error>) {
  const Real = global.FileReader;
  let call = 0;
  class FRMock {
    onload: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    result: string | ArrayBuffer | null = null;
    readAsDataURL(_input: Blob) {
      const item = sequence[Math.min(call, sequence.length - 1)];
      call++;
      if (item instanceof Error) {
        setTimeout(() => this.onerror?.(item), 0);
        return;
      }
      this.result = item;
      setTimeout(() => this.onload?.({ target: this }), 0);
    }
    readAsText(_input: Blob) {
      this.readAsDataURL(_input);
    }
  }
  global.FileReader = FRMock as unknown as typeof FileReader;
  return {
    restore: () => {
      global.FileReader = Real;
    },
  };
}

/**
 * Install a mock Image that either loads successfully with given dimensions or errors.
 */
export function installImageMock({
  width = 100,
  height = 100,
  error = false,
} = {}) {
  const Real = globalThis.Image;
  class ImgMock {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = width;
    height = height;
    set src(_v: string) {
      setTimeout(() => {
        if (error) {
          this.onerror?.();
        } else {
          this.onload?.();
        }
      }, 0);
    }
  }
  globalThis.Image = ImgMock as typeof Image;
  return {
    restore: () => {
      globalThis.Image = Real;
    },
  };
}

/**
 * Spy on document.createElement to return a mocked canvas with controllable behavior.
 */
export function installCanvasMock({
  hasContext = true,
  toBlobReturnsNull = false,
  dataUrl = "data:image/jpeg;base64,MOCK",
} = {}) {
  const ctx = hasContext
    ? {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high" as const,
        drawImage: vi.fn(),
      }
    : null;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) =>
      cb(toBlobReturnsNull ? null : new Blob(["x"], { type: "image/webp" })),
    toDataURL: vi.fn().mockReturnValue(dataUrl),
  } as unknown as HTMLCanvasElement;

  const createSpy = vi
    .spyOn(document, "createElement")
    .mockImplementation(tag =>
      tag === "canvas" ? canvas : document.createElement(tag)
    );

  return {
    canvas,
    createSpy,
    restore: () => createSpy.mockRestore(),
  };
}

/**
 * Build a FileList-like object from an array of File instances.
 */
export function makeFileList(files: File[]): FileList {
  const arr = [...files];
  const fileList = Object.assign(arr, {
    length: arr.length,
    item(index: number) {
      return arr[index] ?? null;
    },
  }) as unknown as FileList;
  return fileList;
}

/**
 * Create an overlays store mock and a `vi.mock` factory for `@/stores/stream-overlays`.
 * Usage:
 *   const { overlays, factory } = createOverlaysMock();
 *   vi.mock("@/stores/stream-overlays", factory);
 *   // then `overlays` can be asserted in tests
 */
export function createOverlaysMock() {
  const overlays = {
    set: vi.fn(),
    setReasoning: vi.fn(),
    setStatus: vi.fn(),
    setCitations: vi.fn(),
    append: vi.fn(),
    appendReasoning: vi.fn(),
    pushToolEvent: vi.fn(),
    clear: vi.fn(),
    clearReasoning: vi.fn(),
    clearStatus: vi.fn(),
    clearCitations: vi.fn(),
    clearTools: vi.fn(),
  };
  const factory = () => ({ useStreamOverlays: { getState: () => overlays } });
  return { overlays, factory };
}

/**
 * Run a block with fake timers enabled, then restore real timers.
 */
export async function withFakeTimers<T>(fn: () => Promise<T> | T): Promise<T> {
  vi.useFakeTimers();
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

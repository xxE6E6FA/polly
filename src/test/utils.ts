import { mock, spyOn } from "bun:test";

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
  if (timersMs > 0) {
    // Use our manual advanceTimersByTime if available
    if (typeof advanceTimersByTime === "function") {
      advanceTimersByTime(timersMs);
    }
    await flushPromises(1);
  }
}

type MockFetchHeaders = HeadersInit | Record<string, string> | Headers;

type MockFetchResponse = {
  status?: number;
  statusText?: string;
  headers?: MockFetchHeaders;
  body?: BodyInit | null;
  ok?: boolean;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
  blob?: () => Promise<Blob>;
};

function normalizeHeaders(headers?: MockFetchHeaders): {
  init?: HeadersInit;
  override?: Headers;
} {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers || Array.isArray(headers)) {
    return { init: headers };
  }
  if (headers instanceof Map) {
    return { init: Array.from(headers.entries()) };
  }
  if (typeof headers === "object" && "get" in headers) {
    return { override: headers as unknown as Headers };
  }
  return { init: Object.entries(headers as Record<string, string>) };
}

function createMockResponse(options: MockFetchResponse = {}): Response {
  const { init, override } = normalizeHeaders(options.headers);
  const statusBase = options.status ?? (options.ok === false ? 500 : 200);
  const res = new Response(options.body ?? null, {
    status: statusBase,
    statusText: options.statusText,
    headers: init,
  });

  if (options.ok !== undefined && res.ok !== options.ok) {
    Object.defineProperty(res, "ok", {
      configurable: true,
      value: options.ok,
    });
  }

  if (override) {
    Object.defineProperty(res, "headers", {
      configurable: true,
      value: override,
    });
  }

  if (options.text) {
    Object.defineProperty(res, "text", {
      configurable: true,
      value: options.text,
    });
  }

  if (options.json) {
    Object.defineProperty(res, "json", {
      configurable: true,
      value: options.json,
    });
  }

  if (options.blob) {
    Object.defineProperty(res, "blob", {
      configurable: true,
      value: options.blob,
    });
  }

  return res;
}

/**
 * Mock global fetch once. Returns the spy for further assertions and a restore helper.
 */
export function mockGlobalFetchOnce(response: MockFetchResponse): {
  spy: unknown;
  restore: () => void;
} {
  const res = createMockResponse(response);
  const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(res);
  return { spy, restore: () => spy.mockRestore() };
}

/**
 * Mock global fetch with a sequence of responses. Each call to fetch resolves the next response.
 */
export function mockGlobalFetchSequence(responses: MockFetchResponse[]): {
  spy: unknown;
  restore: () => void;
} {
  const spy = spyOn(globalThis, "fetch");
  for (const response of responses) {
    spy.mockResolvedValueOnce(createMockResponse(response));
  }
  return { spy, restore: () => spy.mockRestore() };
}

/**
 * Mock fetch to stream NDJSON from an array of strings or objects.
 * Strings are passed through; objects are JSON.stringified.
 */
export function mockFetchNDJSON(
  chunks: Array<string | object>,
  init: MockFetchResponse = {}
) {
  const lines = chunks.map(
    c =>
      (typeof c === "string" ? c : JSON.stringify(c)) +
      (String(c).endsWith("\n") ? "" : "\n")
  );
  const stream = makeNdjsonStream(lines);
  return mockGlobalFetchOnce({
    ok: true,
    headers: { "content-type": "application/x-ndjson" },
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
    ).createObjectURL = mock();
  }
  if (!URL.revokeObjectURL) {
    (
      URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }
    ).revokeObjectURL = mock();
  }
  const createSpy = spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  const revokeSpy = spyOn(URL, "revokeObjectURL").mockImplementation(() => {
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
  const clickSpy = spyOn(a, "click").mockImplementation(() => {
    // Mock implementation for anchor click
  });
  const createSpy = spyOn(document, "createElement").mockImplementation(
    (tag: string) =>
      tag === "a"
        ? (a as HTMLAnchorElement)
        : document.createElement(tag as keyof HTMLElementTagNameMap)
  );
  const appendSpy = spyOn(document.body, "appendChild");
  const removeSpy = spyOn(document.body, "removeChild");
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
      this.result = item as string;
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
        drawImage: mock(),
      }
    : null;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) =>
      cb(toBlobReturnsNull ? null : new Blob(["x"], { type: "image/webp" })),
    toDataURL: mock().mockReturnValue(dataUrl),
  } as unknown as HTMLCanvasElement;

  const createSpy = spyOn(document, "createElement").mockImplementation(
    (tag: string) =>
      tag === "canvas"
        ? canvas
        : document.createElement(tag as keyof HTMLElementTagNameMap)
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
 * Create an overlays store mock and a `mock.module` factory for `@/stores/stream-overlays`.
 * Usage:
 *   const { overlays, factory } = createOverlaysMock();
 *   mock.module("@/stores/stream-overlays", factory);
 *   // then `overlays` can be asserted in tests
 */
export function createOverlaysMock() {
  const overlays = {
    set: mock(),
    setReasoning: mock(),
    setStatus: mock(),
    setCitations: mock(),
    append: mock(),
    appendReasoning: mock(),
    pushToolEvent: mock(),
    clear: mock(),
    clearReasoning: mock(),
    clearStatus: mock(),
    clearCitations: mock(),
    clearTools: mock(),
  };
  const factory = () => ({ useStreamOverlays: { getState: () => overlays } });
  return { overlays, factory };
}

// Manual timer mocking for Bun (since Bun doesn't support vi.useFakeTimers for setTimeout)
let fakeTimerTime = 0;
let timerIdCounter = 0;
const pendingTimers = new Map<
  number,
  { callback: () => void; scheduledAt: number; delay: number }
>();
let originalSetTimeout: typeof setTimeout;
let originalClearTimeout: typeof clearTimeout;
let originalDateNow: typeof Date.now;
let originalWindowSetTimeout: typeof setTimeout | undefined;
let originalWindowClearTimeout: typeof clearTimeout | undefined;
let isFakeTimersActive = false;

function fakeSetTimeout(callback: () => void, delay = 0): number {
  if (!(isFakeTimersActive && originalSetTimeout)) {
    // If fake timers aren't active, use the real setTimeout
    return (originalSetTimeout || globalThis.setTimeout)(
      callback,
      delay
    ) as unknown as number;
  }
  const id = ++timerIdCounter;
  // If delay is 0 or negative, still schedule it (don't execute immediately)
  // This matches real setTimeout behavior where 0 delay still defers execution
  pendingTimers.set(id, {
    callback,
    scheduledAt: fakeTimerTime,
    delay: Math.max(0, delay),
  });
  return id;
}

function fakeClearTimeout(id: number | NodeJS.Timeout | undefined): void {
  if (!(isFakeTimersActive && originalClearTimeout)) {
    // If fake timers aren't active, use the real clearTimeout
    return (originalClearTimeout || globalThis.clearTimeout)(id);
  }
  if (id !== undefined && id !== null) {
    pendingTimers.delete(id as number);
  }
}

export function advanceTimersByTime(ms: number): void {
  if (!isFakeTimersActive) {
    return;
  }
  fakeTimerTime += ms;
  const timersToRun: Array<{ callback: () => void }> = [];
  for (const [id, timer] of pendingTimers.entries()) {
    if (timer.scheduledAt + timer.delay <= fakeTimerTime) {
      timersToRun.push(timer);
      pendingTimers.delete(id);
    }
  }
  for (const timer of timersToRun) {
    timer.callback();
  }
}

/**
 * Run a block with fake timers enabled, then restore real timers.
 */
export async function withFakeTimers<T>(fn: () => Promise<T> | T): Promise<T> {
  // Store originals only if not already stored
  if (!originalSetTimeout) {
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    originalDateNow = Date.now;
  }

  // Clear any pending timers from previous tests
  pendingTimers.clear();

  // Reset state FIRST, before replacing setTimeout
  fakeTimerTime = 0;
  timerIdCounter = 0;

  // Set active flag BEFORE replacing setTimeout so our fake functions know they're active
  isFakeTimersActive = true;

  // Replace with fake timers - mock globalThis, window, and self if they exist
  const fakeSetTimeoutTyped = fakeSetTimeout as typeof setTimeout;
  const fakeClearTimeoutTyped = fakeClearTimeout as typeof clearTimeout;
  globalThis.setTimeout = fakeSetTimeoutTyped;
  globalThis.clearTimeout = fakeClearTimeoutTyped;
  if (typeof window !== "undefined") {
    if (!originalWindowSetTimeout) {
      originalWindowSetTimeout = (
        window as unknown as { setTimeout: typeof setTimeout }
      ).setTimeout;
      originalWindowClearTimeout = (
        window as unknown as { clearTimeout: typeof clearTimeout }
      ).clearTimeout;
    }
    (window as unknown as { setTimeout: typeof setTimeout }).setTimeout =
      fakeSetTimeoutTyped;
    (window as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout =
      fakeClearTimeoutTyped;
  }
  if (typeof self !== "undefined" && self !== globalThis && self !== window) {
    (self as unknown as { setTimeout: typeof setTimeout }).setTimeout =
      fakeSetTimeoutTyped;
    (self as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout =
      fakeClearTimeoutTyped;
  }
  Date.now = () => fakeTimerTime;

  try {
    const result = await fn();
    // Clear any remaining timers before restoring
    pendingTimers.clear();
    return result;
  } finally {
    // Restore real timers
    isFakeTimersActive = false;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (
      typeof window !== "undefined" &&
      originalWindowSetTimeout &&
      originalWindowClearTimeout
    ) {
      (window as unknown as { setTimeout: typeof setTimeout }).setTimeout =
        originalWindowSetTimeout;
      (
        window as unknown as { clearTimeout: typeof clearTimeout }
      ).clearTimeout = originalWindowClearTimeout;
    }
    Date.now = originalDateNow;
    pendingTimers.clear();
  }
}

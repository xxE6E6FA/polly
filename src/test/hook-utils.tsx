import {
  act,
  type RenderHookOptions as RTLRenderHookOptions,
  type RenderHookResult as RTLRenderHookResult,
  renderHook as rtlRenderHook,
  waitFor,
} from "@testing-library/react";

export type RenderHookOptions<P> = RTLRenderHookOptions<P>;

export type RenderHookResult<T, P> = RTLRenderHookResult<T, P>;

export function renderHook<T, P = void>(
  callback: (props: P) => T,
  options: RenderHookOptions<P> = {}
): RenderHookResult<T, P> {
  return rtlRenderHook(
    callback as (props: P) => T,
    options
  ) as RenderHookResult<T, P>;
}

/** Wait until a predicate over result.current passes */
export async function waitForResult<T>(
  result: { current: T },
  predicate: (value: T) => boolean | void,
  timeout = 1000
) {
  await waitFor(
    () => {
      const ok = predicate(result.current as T);
      if (ok === false) {
        throw new Error("predicate returned false");
      }
    },
    { timeout }
  );
}

/** Temporarily override import.meta.env keys for a test; returns a restore function */
export function mockEnv(overrides: Record<string, string | undefined>) {
  const meta = import.meta as unknown as {
    env: Record<string, string | undefined>;
  };
  const prev = { ...meta.env };
  meta.env = { ...meta.env, ...overrides };
  return () => {
    meta.env = prev;
  };
}

// Re-export act for convenience
export { act };

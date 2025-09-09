import { act, render as rtlRender, waitFor } from "@testing-library/react";
import type React from "react";
import { type PropsWithChildren, useLayoutEffect } from "react";

export type RenderHookOptions<P> = {
  initialProps?: P;
  wrapper?: React.ComponentType<PropsWithChildren<unknown>>;
};

export type RenderHookResult<T, P> = {
  result: { current: T };
  rerender: (newProps?: P) => void;
  unmount: () => void;
};

/**
 * Minimal, RTL-based renderHook utility for testing custom hooks.
 * Inspired by @testing-library/react-hooks, without extra deps.
 */
export function renderHook<T, P = void>(
  callback: (props: P) => T,
  options: RenderHookOptions<P> = {}
): RenderHookResult<T, P> {
  const { initialProps, wrapper: Wrapper } = options;
  const result: { current: T } = { current: undefined as unknown as T };

  function HookContainer({ hookProps }: { hookProps: P }) {
    const value = callback(hookProps);
    useLayoutEffect(() => {
      result.current = value;
    }, [value]);
    return null;
  }

  const ui = Wrapper ? (
    <Wrapper>
      <HookContainer hookProps={initialProps as P} />
    </Wrapper>
  ) : (
    <HookContainer hookProps={initialProps as P} />
  );

  const { rerender: rtlRerender, unmount } = rtlRender(
    ui as React.ReactElement
  );

  function rerender(newProps?: P) {
    const next = Wrapper ? (
      <Wrapper>
        <HookContainer hookProps={(newProps as P) ?? (initialProps as P)} />
      </Wrapper>
    ) : (
      <HookContainer hookProps={(newProps as P) ?? (initialProps as P)} />
    );
    rtlRerender(next as React.ReactElement);
  }

  return { result, rerender, unmount };
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

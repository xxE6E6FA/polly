import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { useKeyboardNavigation } from "./use-keyboard-navigation";

type Stub<T extends (...args: any[]) => any> = T & { calls: Parameters<T>[] };

function createStub<T extends (...args: any[]) => any>(impl: T): Stub<T> {
  const stub = ((...args: Parameters<T>) => {
    (stub as Stub<T>).calls.push(args);
    return impl(...args);
  }) as Stub<T>;
  stub.calls = [];
  return stub;
}

type EventParams = {
  key: string;
  shiftKey?: boolean;
  value?: string;
  selectionStart?: number;
  selectionEnd?: number;
};

function createKeyboardEvent({
  key,
  shiftKey = false,
  value = "",
  selectionStart = 0,
  selectionEnd = value.length,
}: EventParams) {
  const preventDefault = createStub(() => {
    /* no-op mock */
  });
  const event = {
    key,
    shiftKey,
    preventDefault,
    currentTarget: {
      selectionStart,
      selectionEnd,
      value,
    },
    target: {
      value,
    },
  };
  return {
    event: event as unknown as KeyboardEvent<HTMLTextAreaElement>,
    preventDefault,
  };
}

describe("useKeyboardNavigation", () => {
  test("submits on Enter without shift and prevents default behavior", () => {
    const onSubmit = createStub(() => {
      /* no-op mock */
    });
    const { result } = renderHook(() => useKeyboardNavigation({ onSubmit }));

    const { event, preventDefault } = createKeyboardEvent({
      key: "Enter",
      value: "Hello",
    });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onSubmit.calls.length).toBe(1);
    expect(preventDefault.calls.length).toBe(1);
  });

  test("navigates history upwards when caret is at the start", () => {
    const onHistoryNavigation = createStub(() => true);
    const onSubmit = createStub(() => {
      /* no-op mock */
    });
    const { result } = renderHook(() =>
      useKeyboardNavigation({ onSubmit, onHistoryNavigation })
    );

    const { event, preventDefault } = createKeyboardEvent({
      key: "ArrowUp",
      value: "message",
      selectionStart: 0,
      selectionEnd: 0,
    });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onHistoryNavigation.calls.length).toBe(1);
    expect(preventDefault.calls.length).toBe(1);
    expect(onSubmit.calls.length).toBe(0);
  });

  test("navigates history downwards when caret is at the end", () => {
    const onHistoryNavigationDown = createStub(() => true);
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        onSubmit: () => {
          /* no-op mock */
        },
        onHistoryNavigationDown,
      })
    );

    const { event, preventDefault } = createKeyboardEvent({
      key: "ArrowDown",
      value: "draft",
      selectionStart: 5,
      selectionEnd: 5,
    });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onHistoryNavigationDown.calls.length).toBe(1);
    expect(preventDefault.calls.length).toBe(1);
  });

  test("clears persona when pressing backspace on empty input", () => {
    const onPersonaClear = createStub(() => {
      /* no-op mock */
    });
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        onSubmit: () => {
          /* no-op mock */
        },
        onPersonaClear,
      })
    );

    const { event, preventDefault } = createKeyboardEvent({
      key: "Backspace",
      value: "",
    });

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onPersonaClear.calls.length).toBe(1);
    expect(preventDefault.calls.length).toBe(1);
  });
});

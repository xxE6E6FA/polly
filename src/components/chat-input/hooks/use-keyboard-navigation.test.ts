import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";
import { useKeyboardNavigation } from "./use-keyboard-navigation";

function makeTextarea(value: string, selStart: number, selEnd: number) {
  const el = document.createElement("textarea");
  el.value = value;
  Object.defineProperty(el, "selectionStart", {
    value: selStart,
    configurable: true,
  });
  Object.defineProperty(el, "selectionEnd", {
    value: selEnd,
    configurable: true,
  });
  return el as HTMLTextAreaElement;
}

describe("useKeyboardNavigation", () => {
  it("submits on Enter without shift", () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useKeyboardNavigation({ onSubmit }));
    const e = {
      key: "Enter",
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    result.current.handleKeyDown(e);
    expect(onSubmit).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("navigates history on ArrowUp/Down when at edges", () => {
    const onHistoryNavigation = vi.fn().mockReturnValue(true);
    const onHistoryNavigationDown = vi.fn().mockReturnValue(true);
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        onSubmit,
        onHistoryNavigation,
        onHistoryNavigationDown,
      })
    );

    const up = {
      key: "ArrowUp",
      shiftKey: false,
      currentTarget: makeTextarea("abc", 0, 0),
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    result.current.handleKeyDown(up);
    expect(onHistoryNavigation).toHaveBeenCalled();
    expect(up.preventDefault).toHaveBeenCalled();

    const down = {
      key: "ArrowDown",
      shiftKey: false,
      currentTarget: makeTextarea("abc", 3, 3),
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    result.current.handleKeyDown(down);
    expect(onHistoryNavigationDown).toHaveBeenCalled();
    expect(down.preventDefault).toHaveBeenCalled();
  });

  it("clears persona on backspace when empty", () => {
    const onPersonaClear = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ onSubmit: vi.fn(), onPersonaClear })
    );
    const e = {
      key: "Backspace",
      target: makeTextarea("", 0, 0),
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    result.current.handleKeyDown(e);
    expect(onPersonaClear).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("does not navigate when caret not at edges", () => {
    const onHistoryNavigation = vi.fn().mockReturnValue(true);
    const onHistoryNavigationDown = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        onSubmit: vi.fn(),
        onHistoryNavigation,
        onHistoryNavigationDown,
      })
    );
    // Up but caret not at start
    result.current.handleKeyDown({
      key: "ArrowUp",
      shiftKey: false,
      currentTarget: makeTextarea("abc", 1, 1),
    } as unknown as React.KeyboardEvent);
    // Down but caret not at end
    result.current.handleKeyDown({
      key: "ArrowDown",
      shiftKey: false,
      currentTarget: makeTextarea("abc", 1, 1),
    } as unknown as React.KeyboardEvent);
    expect(onHistoryNavigation).not.toHaveBeenCalled();
    expect(onHistoryNavigationDown).not.toHaveBeenCalled();
  });
});

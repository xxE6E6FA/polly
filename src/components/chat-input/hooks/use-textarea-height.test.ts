import { act, render } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";
import { useTextareaHeight } from "./use-textarea-height";

function mockComputedStyle({
  lineHeight = "20px",
  paddingTop = "8px",
  paddingBottom = "8px",
  fontSize = "16px",
} = {}) {
  const orig = window.getComputedStyle;
  const spy = vi.spyOn(window, "getComputedStyle").mockImplementation(
    (el: Element) =>
      ({
        lineHeight,
        paddingTop,
        paddingBottom,
        fontSize,
      }) as CSSStyleDeclaration
  );
  return {
    restore: () => {
      spy.mockRestore();
      window.getComputedStyle = orig;
    },
  };
}

function setScrollHeight(el: HTMLTextAreaElement, h: number) {
  Object.defineProperty(el, "scrollHeight", {
    get: () => h,
    configurable: true,
  });
}

describe("useTextareaHeight", () => {
  it("auto-grows up to 5 lines with overflow control and reports multiline", () => {
    const { restore } = mockComputedStyle({
      lineHeight: "20px",
      paddingTop: "8px",
      paddingBottom: "8px",
    });
    const onHeightChange = vi.fn();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    // Start with empty value => enforces single-line min height
    const { result, rerender } = renderHook(
      ({ value }) => useTextareaHeight({ value, onHeightChange }),
      {
        initialProps: { value: "" },
      }
    );

    // scrollHeight e.g., 40; minH = ceil(20 + 16) = 36
    setScrollHeight(textarea, 40);
    act(() => result.current.resizeTextarea(textarea));
    expect(textarea.style.height).toBe("36px");
    expect(textarea.style.overflowY).toBe("hidden");

    // Non-empty with moderate content height => grows within max
    rerender({ value: "hello" });
    setScrollHeight(textarea, 60);
    act(() => result.current.resizeTextarea(textarea));
    expect(textarea.style.height).toBe("60px");
    expect(textarea.style.overflowY).toBe("hidden");
    expect(onHeightChange).toHaveBeenCalledWith(true);

    // Exceed 5 lines => cap at max and enable scroll
    setScrollHeight(textarea, 200);
    act(() => result.current.resizeTextarea(textarea));
    // maxH = ceil(20*5 + 16) = 116
    expect(textarea.style.height).toBe("116px");
    expect(textarea.style.overflowY).toBe("auto");

    // Clearing value triggers reset to false via effect
    rerender({ value: "" });
    expect(onHeightChange).toHaveBeenCalledWith(false);

    restore();
  });

  it("fullscreen defers height to CSS and keeps overflow auto", () => {
    const { restore } = mockComputedStyle();
    const onHeightChange = vi.fn();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    const { result } = renderHook(() =>
      useTextareaHeight({ value: "abc", onHeightChange, isFullscreen: true })
    );
    setScrollHeight(textarea, 300);
    act(() => result.current.resizeTextarea(textarea));
    expect(textarea.style.minHeight).toBe("");
    expect(textarea.style.maxHeight).toBe("");
    expect(textarea.style.overflowY).toBe("auto");
    expect(onHeightChange).toHaveBeenCalledWith(true);
    restore();
  });

  it("falls back when line-height is 'normal' and ignores null target", () => {
    const { restore } = mockComputedStyle({
      lineHeight: "normal",
      fontSize: "20px",
      paddingTop: "0px",
      paddingBottom: "0px",
    });
    const onHeightChange = vi.fn();
    const { result } = renderHook(() =>
      useTextareaHeight({ value: "x", onHeightChange })
    );
    const ta = document.createElement("textarea");
    // With fontSize 20px, fallback lineHeight ≈ 24 => minH ≈ 24
    setScrollHeight(ta, 30);
    act(() => result.current.resizeTextarea(ta));
    expect(ta.style.height).toBe("30px");
    // Call with null is a no-op
    act(() => result.current.resizeTextarea(null));
    restore();
  });
});

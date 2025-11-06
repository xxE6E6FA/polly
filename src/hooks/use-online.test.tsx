import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { mockNavigatorOnline } from "../../test/test-utils";
import { useOnline } from "./use-online";

let restoreNavigator: (() => void) | undefined;

beforeEach(() => {
  restoreNavigator?.();
  restoreNavigator = mockNavigatorOnline(true);
});

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = undefined;
});

describe("useOnline", () => {
  test("initial state respects navigator.onLine", () => {
    restoreNavigator?.();
    restoreNavigator = mockNavigatorOnline(false);

    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });

  test("updates when online/offline events fire", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => {
      restoreNavigator?.();
      restoreNavigator = mockNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    act(() => {
      restoreNavigator?.();
      restoreNavigator = mockNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});

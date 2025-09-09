import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";
import { withFakeTimers } from "../test/utils";

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
}));

import { type PaginatedQueryReference, usePaginatedQuery } from "convex/react";
import { useVirtualizedPagination } from "./use-virtualized-pagination";

describe("useVirtualizedPagination", () => {
  it("maps status flags and throttles loadMore calls", async () => {
    const loadMore = vi.fn();
    (usePaginatedQuery as unknown as vi.Mock).mockReturnValue({
      status: "CanLoadMore",
      loadMore,
      data: [],
    });

    await withFakeTimers(() => {
      const { result } = renderHook(() =>
        useVirtualizedPagination(
          {} as unknown as PaginatedQueryReference,
          {},
          { throttleDelay: 100 }
        )
      );

      expect(result.current.hasNextPage).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isLoadingMore).toBe(false);

      // First call triggers
      act(() => result.current.loadMore(5));
      expect(loadMore).toHaveBeenCalledWith(5);

      // Second call within throttle window ignored
      act(() => result.current.loadMore(5));
      expect(loadMore).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(100));
      act(() => result.current.loadMore(5));
      expect(loadMore).toHaveBeenCalledTimes(2);
    });
  });

  it("does not call loadMore when cannot load more", () => {
    const loadMore = vi.fn();
    (usePaginatedQuery as unknown as vi.Mock).mockReturnValue({
      status: "Exhausted",
      loadMore,
      data: [],
    });
    const { result } = renderHook(() =>
      useVirtualizedPagination(
        {} as unknown as PaginatedQueryReference,
        {},
        { throttleDelay: 50 }
      )
    );
    act(() => result.current.loadMore());
    expect(loadMore).not.toHaveBeenCalled();
  });

  it("reflects loading states correctly", () => {
    (usePaginatedQuery as unknown as vi.Mock)
      .mockReturnValueOnce({
        status: "LoadingFirstPage",
        loadMore: vi.fn(),
        data: [],
      })
      .mockReturnValueOnce({
        status: "LoadingMore",
        loadMore: vi.fn(),
        data: [],
      })
      .mockReturnValue({ status: "CanLoadMore", loadMore: vi.fn(), data: [] });

    const r1 = renderHook(() =>
      useVirtualizedPagination({} as unknown as PaginatedQueryReference, {})
    );
    expect(r1.result.current.isLoading).toBe(true);

    const r2 = renderHook(() =>
      useVirtualizedPagination({} as unknown as PaginatedQueryReference, {})
    );
    expect(r2.result.current.isLoadingMore).toBe(true);

    const r3 = renderHook(() =>
      useVirtualizedPagination({} as unknown as PaginatedQueryReference, {})
    );
    expect(r3.result.current.canLoadMore).toBe(true);
  });
});

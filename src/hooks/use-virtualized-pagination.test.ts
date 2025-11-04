import {
  beforeEach,
  mock as createMock,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../test/hook-utils";

const usePaginatedQueryMock = mock();

mock.module("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

import { type PaginatedQueryReference, usePaginatedQuery } from "convex/react";
import { useVirtualizedPagination } from "./use-virtualized-pagination";

describe("useVirtualizedPagination", () => {
  beforeEach(() => {
    usePaginatedQueryMock.mockClear();
  });

  test("maps status flags and throttles loadMore calls", async () => {
    const loadMore = createMock();
    usePaginatedQueryMock.mockReturnValue({
      status: "CanLoadMore",
      loadMore,
      data: [],
    });

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

    // Wait for throttle delay to pass
    await new Promise(resolve => setTimeout(resolve, 100));

    act(() => result.current.loadMore(5));
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  test("does not call loadMore when cannot load more", () => {
    const loadMore = createMock();
    usePaginatedQueryMock.mockReturnValue({
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

  test("reflects loading states correctly", () => {
    usePaginatedQueryMock
      .mockReturnValueOnce({
        status: "LoadingFirstPage",
        loadMore: createMock(),
        data: [],
      })
      .mockReturnValueOnce({
        status: "LoadingMore",
        loadMore: createMock(),
        data: [],
      })
      .mockReturnValue({
        status: "CanLoadMore",
        loadMore: createMock(),
        data: [],
      });

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

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../test/hook-utils";

let useQueryMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useQuery } from "convex/react";
import * as LocalStorageModule from "@/lib/local-storage";
import { useConversationSelection } from "./use-conversation-selection";

const convs = Array.from({ length: 5 }).map((_, i) => ({
  _id: `c${i + 1}` as Id<"conversations">,
  _creationTime: i,
  title: `T${i + 1}`,
  createdAt: i,
  updatedAt: i,
}));

describe("useConversationSelection", () => {
  let getSpy: ReturnType<typeof spyOn>;
  let setSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useQueryMock = mock(() => convs);
    getSpy = spyOn(LocalStorageModule, "get").mockReturnValue(undefined);
    setSpy = spyOn(LocalStorageModule, "set").mockImplementation(() => {
      // Intentional no-op for test mock
    });
  });

  afterEach(() => {
    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  test("maps conversations, caches them, and supports selection toggles", () => {
    useQueryMock.mockImplementation(() => convs);
    const { result } = renderHook(() => useConversationSelection());

    // Cached via local storage
    expect(setSpy).toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(5);

    // Toggle single
    act(() => {
      result.current.handleConversationSelect(convs[1]?._id, 1, false);
    });
    expect(result.current.selectedConversations.has(convs[1]?._id)).toBe(true);
    // Toggle off
    act(() => {
      result.current.handleConversationSelect(convs[1]?._id, 1, false);
    });
    expect(result.current.selectedConversations.has(convs[1]?._id)).toBe(false);
  });

  test("supports shift range selection and select all / clear", () => {
    useQueryMock.mockImplementation(() => convs);
    const { result } = renderHook(() => useConversationSelection());
    act(() => {
      result.current.handleConversationSelect(convs[1]?._id, 1, false);
    });
    act(() => {
      result.current.handleConversationSelect(convs[3]?._id, 3, true);
    });
    expect(result.current.selectedConversations.has(convs[1]?._id)).toBe(true);
    expect(result.current.selectedConversations.has(convs[2]?._id)).toBe(true);
    expect(result.current.selectedConversations.has(convs[3]?._id)).toBe(true);

    // Select all
    act(() => result.current.onSelectAll());
    expect(result.current.allSelected).toBe(true);
    expect(result.current.someSelected).toBe(true);

    // Clear
    act(() => result.current.clearSelection());
    expect(result.current.someSelected).toBe(false);
  });

  test("falls back to cached conversations when query not array", () => {
    useQueryMock.mockImplementation(() => undefined);
    getSpy.mockReturnValue(convs as never);

    const { result } = renderHook(() => useConversationSelection());
    expect(result.current.conversations).toHaveLength(5);
  });

  test("exposes includeAttachments toggler", () => {
    useQueryMock.mockImplementation(() => convs);
    const { result } = renderHook(() => useConversationSelection());
    expect(result.current.includeAttachments).toBe(true);
    act(() => result.current.onIncludeAttachmentsChange(true));
    expect(result.current.includeAttachments).toBe(true);
  });
});

import type { Id } from "@convex/_generated/dataModel";

import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("@/lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape matches implementation */
  CACHE_KEYS: { conversations: "conversations" },
  get: vi.fn(),
  set: vi.fn(),
}));

import { useQuery } from "convex/react";
import { get, set } from "@/lib/local-storage";
import { useConversationSelection } from "./use-conversation-selection";

const convs = Array.from({ length: 5 }).map((_, i) => ({
  _id: `c${i + 1}` as Id<"conversations">,
  _creationTime: i,
  title: `T${i + 1}`,
  createdAt: i,
  updatedAt: i,
}));

describe("useConversationSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps conversations, caches them, and supports selection toggles", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(convs);
    const { result } = renderHook(() => useConversationSelection());

    // Cached via local storage
    expect(set).toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(5);

    // Toggle single
    act(() => {
      result.current.handleConversationSelect(convs[1]._id, 1, false);
    });
    expect(result.current.selectedConversations.has(convs[1]._id)).toBe(true);
    // Toggle off
    act(() => {
      result.current.handleConversationSelect(convs[1]._id, 1, false);
    });
    expect(result.current.selectedConversations.has(convs[1]._id)).toBe(false);
  });

  it("supports shift range selection and select all / clear", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(convs);
    const { result } = renderHook(() => useConversationSelection());
    act(() => {
      result.current.handleConversationSelect(convs[1]._id, 1, false);
    });
    act(() => {
      result.current.handleConversationSelect(convs[3]._id, 3, true);
    });
    expect(result.current.selectedConversations.has(convs[1]._id)).toBe(true);
    expect(result.current.selectedConversations.has(convs[2]._id)).toBe(true);
    expect(result.current.selectedConversations.has(convs[3]._id)).toBe(true);

    // Select all
    act(() => result.current.onSelectAll());
    expect(result.current.allSelected).toBe(true);
    expect(result.current.someSelected).toBe(true);

    // Clear
    act(() => result.current.clearSelection());
    expect(result.current.someSelected).toBe(false);
  });

  it("falls back to cached conversations when query not array", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    (get as unknown as vi.Mock).mockReturnValue(convs);

    const { result } = renderHook(() => useConversationSelection());
    expect(result.current.conversations).toHaveLength(5);
  });

  it("exposes includeAttachments toggler", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(convs);
    const { result } = renderHook(() => useConversationSelection());
    expect(result.current.includeAttachments).toBe(false);
    act(() => result.current.onIncludeAttachmentsChange(true));
    expect(result.current.includeAttachments).toBe(true);
  });
});

import type { Id } from "@convex/_generated/dataModel";

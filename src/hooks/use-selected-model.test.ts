import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderHook } from "../test/hook-utils";

let useQueryMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useQuery } from "convex/react";
import * as LocalStorageModule from "@/lib/local-storage";
import {
  createChatInputStore,
  setChatInputStoreApi,
  useChatInputStore,
} from "@/stores/chat-input-store";
import { setupZustandTestStore } from "@/test/zustand";
import { useSelectedModel } from "./use-selected-model";

afterAll(() => {
  mock.restore();
});

describe("useSelectedModel", () => {
  let getSpy: ReturnType<typeof spyOn>;

  const getStore = setupZustandTestStore({
    createStore: () => createChatInputStore(),
    setStore: setChatInputStoreApi,
  });

  beforeEach(() => {
    useQueryMock = mock();
    getSpy = spyOn(LocalStorageModule, "get");
    getSpy.mockReset();
    getSpy.mockReturnValue(undefined);
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  test("hydrates from server when available", async () => {
    const store = getStore();
    store.setState({ selectedModel: null });

    const expectedModel = {
      modelId: "gpt",
      provider: "openai",
    } as const;
    useQueryMock.mockReturnValue({
      _id: "m1",
      name: "custom",
      ...expectedModel,
    });

    const { result } = renderHook(() => useSelectedModel());

    await waitFor(() => {
      expect(result.current[0]).toMatchObject(expectedModel);
    });
  });

  test("does not overwrite when already selected and no server value", () => {
    const store = getStore();
    store.setState({
      selectedModel: {
        _id: "m1" as any,
        _creationTime: 123,
        userId: "u1" as any,
        modelId: "keep",
        name: "test",
        provider: "x",
        contextLength: 1000,
        supportsImages: false,
        supportsTools: false,
        supportsReasoning: false,
        createdAt: 123,
      },
    });
    useQueryMock.mockReturnValue(undefined);
    getSpy.mockReturnValue(null);

    renderHook(() => useSelectedModel());

    // Should not overwrite existing selection
    expect(store.getState().selectedModel).toMatchObject({
      modelId: "keep",
      provider: "x",
    });
  });
});

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { renderHook } from "../test/hook-utils";
import { createToastMock, mockToastContext } from "../test/utils";

let useMutationMock: ReturnType<typeof mock>;
const toastMock = createToastMock();

mock.module("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

await mockToastContext(toastMock);

import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as LocalStorageModule from "@/lib/local-storage";
import { useSelectModel } from "./use-select-model";

describe("useSelectModel", () => {
  let setSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useMutationMock = mock();
    Object.assign(toastMock, createToastMock());
    setSpy = spyOn(LocalStorageModule, "set").mockImplementation(() => {
      // Intentional no-op for test mock
    });
  });

  afterEach(() => {
    setSpy.mockRestore();
  });

  test("sets localStorage cache when catalog contains model and calls mutation", async () => {
    const mutate = mock(() => Promise.resolve(undefined));
    useMutationMock.mockImplementation(() => mutate);

    const catalog = [
      { modelId: "gpt", provider: "openai", _id: "a" as Id<"userModels"> },
      { modelId: "other", provider: "x", _id: "b" as Id<"userModels"> },
    ] as Doc<"userModels">[];

    const { result } = renderHook(() => useSelectModel());
    await result.current.selectModel("gpt", "openai", catalog);
    expect(setSpy).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith({ modelId: "gpt", provider: "openai" });
  });

  test("does not cache when catalog is missing but still calls mutation", async () => {
    const mutate = mock(() => Promise.resolve(undefined));
    useMutationMock.mockImplementation(() => mutate);

    const { result } = renderHook(() => useSelectModel());
    await result.current.selectModel("m", "p");
    expect(setSpy).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith({ modelId: "m", provider: "p" });
  });

  test("shows toast on mutation error", async () => {
    const mutate = mock(() => Promise.reject(new Error("fail")));
    useMutationMock.mockImplementation(() => mutate);
    const error = toastMock.error;

    const { result } = renderHook(() => useSelectModel());
    await result.current.selectModel("m", "p", []);
    expect(error).toHaveBeenCalled();
  });
});

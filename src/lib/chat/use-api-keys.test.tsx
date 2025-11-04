import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "../../test/hook-utils";

let useActionMock: ReturnType<typeof mock>;
const createApiModule = () => ({
  api: {
    apiKeys: {
      getDecryptedApiKey: "apiKeys:getDecryptedApiKey" as never,
    },
  } as never,
});

mock.module("convex/react", () => ({
  useAction: (...args: unknown[]) => useActionMock(...args),
}));
mock.module("@convex/_generated/api", () => createApiModule());

import { useAction } from "convex/react";
import { useApiKeys } from "./use-api-keys";

describe("use-api-keys", () => {
  test("wraps useAction(getDecryptedApiKey) and forwards args", async () => {
    const actionMock = mock(() => Promise.resolve("sk-123"));
    useActionMock = mock(() => actionMock);

    const { result } = renderHook(() => useApiKeys());
    const { getDecryptedApiKey } = result.current;

    const key = await getDecryptedApiKey({
      provider: "replicate",
      modelId: "flux",
    });
    expect(key).toBe("sk-123");
    expect(actionMock).toHaveBeenCalledWith({
      provider: "replicate",
      modelId: "flux",
    });
  });
});

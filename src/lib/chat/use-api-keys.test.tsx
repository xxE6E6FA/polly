import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../../test/hook-utils";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));

import { useAction } from "convex/react";
import { useApiKeys } from "./use-api-keys";

describe("use-api-keys", () => {
  it("wraps useAction(getDecryptedApiKey) and forwards args", async () => {
    const actionMock = vi.fn().mockResolvedValue("sk-123");
    (useAction as unknown as vi.Mock).mockReturnValue(actionMock);

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

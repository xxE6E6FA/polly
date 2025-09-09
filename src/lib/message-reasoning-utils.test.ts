import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  getDefaultReasoningConfig,
  useLastMessageReasoningConfig,
} from "./message-reasoning-utils";

describe("message-reasoning-utils", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("getDefaultReasoningConfig returns disabled, medium effort", () => {
    const cfg = getDefaultReasoningConfig();
    expect(cfg).toEqual({ enabled: false, effort: "medium" });
  });

  it("useLastMessageReasoningConfig returns null when query undefined", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    const result = useLastMessageReasoningConfig(
      "conv-1" as Id<"conversations">
    );
    expect(result).toBeNull();
  });

  it("useLastMessageReasoningConfig returns null when page missing", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue({ page: undefined });
    const result = useLastMessageReasoningConfig(
      "conv-1" as Id<"conversations">
    );
    expect(result).toBeNull();
  });

  it("useLastMessageReasoningConfig finds last user message with reasoning from array", () => {
    const messages = [
      { role: "assistant", reasoningConfig: { enabled: false } },
      { role: "user" },
      { role: "user", reasoningConfig: { enabled: true, effort: "high" } },
      { role: "user", reasoningConfig: { enabled: true, effort: "low" } },
    ];
    (useQuery as unknown as vi.Mock).mockReturnValue(messages);

    const result = useLastMessageReasoningConfig(
      "conv-1" as Id<"conversations">
    );
    expect(result).toEqual({ enabled: true, effort: "low" });
  });

  it("useLastMessageReasoningConfig handles paginated shape with page[]", () => {
    const page = [
      { role: "user" },
      { role: "assistant" },
      { role: "user", reasoningConfig: { enabled: true, effort: "medium" } },
    ];
    (useQuery as unknown as vi.Mock).mockReturnValue({ page });

    const result = useLastMessageReasoningConfig(
      "conv-1" as Id<"conversations">
    );
    expect(result).toEqual({ enabled: true, effort: "medium" });
  });
});

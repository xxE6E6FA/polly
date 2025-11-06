import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import type { AIModel, Attachment } from "@/types";
import {
  type ChatInputStoreState,
  getChatInputStore,
} from "./chat-input-store";

const originalConsoleError = console.error;

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
});

function getState() {
  return getChatInputStore().getState() as ChatInputStoreState;
}

describe("chat-input-store", () => {
  test("selected model slice updates and clears", () => {
    const state = getState();
    expect(state.selectedModel).toBeNull();

    const testModel: AIModel = {
      // biome-ignore lint/style/useNamingConvention: Convex system field
      _id: "model-1" as Id<"userModels">,
      // biome-ignore lint/style/useNamingConvention: Convex system field
      _creationTime: Date.now(),
      userId: "user-1" as Id<"users">,
      modelId: "gpt-4o",
      provider: "openai",
      name: "GPT-4o",
      contextLength: 128_000,
      supportsReasoning: true,
      supportsImages: true,
      supportsTools: true,
      supportsFiles: true,
      createdAt: Date.now(),
    };

    state.setSelectedModel(testModel);
    expect(getState().selectedModel).toBe(testModel);

    state.setSelectedModel(null);
    expect(getState().selectedModel).toBeNull();
  });

  test("persona and temperature slices persist per key and are idempotent", () => {
    const state = getState();
    expect(state.selectedByKey).toEqual({});
    expect(state.temperatureByKey).toEqual({});

    state.setSelectedPersonaId("conv-1", "persona-1" as Id<"personas">);
    state.setSelectedPersonaId("conv-1", "persona-1" as Id<"personas">);

    expect(getState().selectedByKey["conv-1"]).toBe(
      "persona-1" as Id<"personas">
    );

    state.clearKey("conv-1");
    expect(getState().selectedByKey["conv-1"]).toBeUndefined();

    state.setSelectedPersonaId("conv-1", "persona-2" as Id<"personas">);
    state.clearAll();
    expect(getState().selectedByKey).toEqual({});

    state.setTemperature("conv-1", 0.5);
    state.setTemperature("conv-1", 0.5);
    expect(getState().temperatureByKey["conv-1"]).toBe(0.5);

    state.setTemperature("conv-1", undefined);
    expect(getState().temperatureByKey["conv-1"]).toBeUndefined();

    state.setTemperature("conv-2", 0.9);
    state.clearTemperatureKey("conv-2");
    expect(getState().temperatureByKey["conv-2"]).toBeUndefined();

    state.setTemperature("conv-3", 0.6);
    state.clearAllTemperature();
    expect(getState().temperatureByKey).toEqual({});
  });

  test("attachments slice respects functional updates and clears per key", () => {
    const state = getState();
    const attachmentsA: Attachment[] = [
      { type: "image", name: "first.png", url: "first.png", size: 100 },
    ];

    state.setAttachments("conv-1", attachmentsA);
    expect(getState().attachmentsByKey["conv-1"]).toEqual(attachmentsA);

    const before = getState().attachmentsByKey["conv-1"];
    state.setAttachments("conv-1", attachmentsA);
    expect(getState().attachmentsByKey["conv-1"]).toBe(before);

    state.setAttachments("conv-1", prev => [
      ...(prev ?? []),
      { type: "pdf", name: "second.pdf", url: "second.pdf", size: 200 },
    ]);
    expect(getState().attachmentsByKey["conv-1"]).toEqual([
      { type: "image", name: "first.png", url: "first.png", size: 100 },
      { type: "pdf", name: "second.pdf", url: "second.pdf", size: 200 },
    ]);

    state.clearAttachmentsKey("conv-1");
    expect(getState().attachmentsByKey["conv-1"]).toBeUndefined();
  });

  test("reasoning config setter overwrites entire object", () => {
    const state = getState();
    expect(state.reasoningConfig).toEqual({ enabled: false });

    state.setReasoningConfig({ enabled: true, effort: "high" });
    expect(getState().reasoningConfig).toEqual({
      enabled: true,
      effort: "high",
    });
  });
});

import { describe, expect, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { setupZustandTestStore } from "@/test/zustand";
import type { AIModel } from "@/types";
import {
  createChatInputStore,
  GLOBAL_CHAT_INPUT_KEY,
  getChatKey,
  getSelectedPersonaIdFromStore,
  makeChatInputKey,
  setChatInputStoreApi,
  useChatInputStore,
} from "./chat-input-store";

setupZustandTestStore({
  createStore: () => createChatInputStore(),
  setStore: setChatInputStoreApi,
});

describe("stores/chat-input-store", () => {
  test("manages model, params, reasoning and persona/temperature slices", () => {
    const s = useChatInputStore.getState();

    // Model
    expect(s.selectedModel).toBeNull();
    s.setSelectedModel({
      _id: "m1" as any,
      _creationTime: 123,
      userId: "u1" as any,
      modelId: "m1",
      name: "n",
      provider: "p",
      contextLength: 1000,
      supportsImages: false,
      supportsTools: false,
      supportsReasoning: false,
      createdAt: 123,
    });
    expect(useChatInputStore.getState().selectedModel?._id as string).toBe(
      "m1"
    );

    // Generation mode & image params
    s.setGenerationMode("image");
    expect(useChatInputStore.getState().generationMode).toBe("image");
    s.setImageParams(prev => ({ ...prev, prompt: "hello", model: "img" }));
    expect(useChatInputStore.getState().imageParams).toEqual({
      prompt: "hello",
      model: "img",
    });
    // Also support direct object
    s.setImageParams({ prompt: "p2", model: "m2" });
    expect(useChatInputStore.getState().imageParams).toEqual({
      prompt: "p2",
      model: "m2",
    });
    s.setNegativePromptEnabled(true);
    expect(useChatInputStore.getState().negativePromptEnabled).toBe(true);

    // Reasoning
    s.setReasoningConfig({ enabled: true, effort: "low", maxTokens: 123 });
    expect(useChatInputStore.getState().reasoningConfig).toEqual({
      enabled: true,
      effort: "low",
      maxTokens: 123,
    });

    // Persona slice
    const k = getChatKey("c1");
    s.setSelectedPersonaId(k, "p1" as Id<"personas">);
    expect(getSelectedPersonaIdFromStore(k) as string).toBe("p1");
    // Setting same value is a no-op branch
    s.setSelectedPersonaId(k, "p1" as Id<"personas">);
    s.clearKey(k);
    expect(getSelectedPersonaIdFromStore(k)).toBeNull();
    s.setSelectedPersonaId(k, "p2" as Id<"personas">);
    s.clearAll();
    expect(getSelectedPersonaIdFromStore(k)).toBeNull();

    // Temperature slice
    s.setTemperature(k, 0.7);
    expect(useChatInputStore.getState().temperatureByKey[k]).toBe(0.7);
    // Setting same value is a no-op branch
    s.setTemperature(k, 0.7);
    s.clearTemperatureKey(k);
    expect(useChatInputStore.getState().temperatureByKey[k]).toBeUndefined();
    s.setTemperature(k, 0.4);
    s.clearAllTemperature();
    expect(useChatInputStore.getState().temperatureByKey[k]).toBeUndefined();
  });

  test("manages attachments by key with functional updates and no-op equality", () => {
    const key = getChatKey(null);
    const s = useChatInputStore.getState();

    s.setAttachments(key, []);
    s.setAttachments(key, prev => [
      ...prev,
      { type: "image", url: "u", name: "n", size: 1, content: "" },
    ]);
    expect(useChatInputStore.getState().attachmentsByKey[key]?.length).toBe(1);

    // No change when setting identical array reference
    const arr = useChatInputStore.getState().attachmentsByKey[key] ?? [];
    s.setAttachments(key, arr);
    expect(useChatInputStore.getState().attachmentsByKey[key]).toBe(arr);

    // No change when setting new array with identical items
    const sameItems = [...arr];
    s.setAttachments(key, sameItems);
    expect(useChatInputStore.getState().attachmentsByKey[key]).toBe(arr);

    // Clear key
    s.clearAttachmentsKey(key);
    expect(useChatInputStore.getState().attachmentsByKey[key]).toBeUndefined();
    // No-op clearing non-existing
    s.clearAttachmentsKey("missing");
  });

  test("chat key helpers return stable keys", () => {
    expect(getChatKey(undefined)).toBe(GLOBAL_CHAT_INPUT_KEY);
    expect(getChatKey(null)).toBe(GLOBAL_CHAT_INPUT_KEY);
    expect(getChatKey("c")).toBe("c");
    expect(makeChatInputKey(undefined, true)).toBe(GLOBAL_CHAT_INPUT_KEY);
    expect(makeChatInputKey("c", false)).toBe("c");
  });
});

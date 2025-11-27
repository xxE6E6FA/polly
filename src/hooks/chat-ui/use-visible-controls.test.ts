import { describe, expect, it } from "bun:test";
import { useVisibleControls } from "./use-visible-controls";

// Mock isUserModel since we can't easily import the real one in unit tests without complex mocking
// We'll just mock the behavior by passing objects that look like models
const _mockUserModel = {
  _id: "model1",
  name: "User Model",
  creatorId: "user1",
} as any;
const _mockSystemModel = { _id: "model2", name: "System Model" } as any;

// We need to mock the module that exports isUserModel
// Since we are testing a hook that imports a utility, we can rely on the fact that
// the hook implementation uses isUserModel. However, for a pure unit test of the hook logic
// where we can't easily mock module imports in bun test without setup,
// we might need to rely on the fact that isUserModel checks for creatorId presence/validity usually.
// Let's look at the implementation of isUserModel in the codebase if possible, or just trust the logic flow.
// Actually, `isUserModel` is imported. In a unit test environment, we might need to mock it.
// But for now, let's assume we can test the logic based on inputs.
// If `isUserModel` is a simple pure function, it will work.
// Let's check `src/lib/type-guards.ts` content first to be sure.

describe("useVisibleControls", () => {
  it("should show text controls in text mode when canSend is true", () => {
    const result = useVisibleControls({
      generationMode: "text",
      isPrivateMode: false,
      hasReplicateApiKey: false,
      canSend: true,
      selectedModel: null,
    });

    expect(result.showModelPicker).toBe(true);
    expect(result.showPersonaSelector).toBe(true);
    expect(result.showTemperaturePicker).toBe(true);
    expect(result.showReasoningPicker).toBe(false); // No model selected
    expect(result.showAspectRatioPicker).toBe(false);
    expect(result.showImageSettings).toBe(false);
  });

  it("should hide all controls when canSend is false", () => {
    const result = useVisibleControls({
      generationMode: "text",
      isPrivateMode: false,
      hasReplicateApiKey: true,
      canSend: false,
      selectedModel: null,
    });

    expect(result.showModelPicker).toBe(false);
    expect(result.showPersonaSelector).toBe(false);
    expect(result.showTemperaturePicker).toBe(false);
    expect(result.showReasoningPicker).toBe(false);
    expect(result.showAspectRatioPicker).toBe(false);
    expect(result.showImageSettings).toBe(false);
  });

  it("should show image controls in image mode with API key and not private", () => {
    const result = useVisibleControls({
      generationMode: "image",
      isPrivateMode: false,
      hasReplicateApiKey: true,
      canSend: true,
      selectedModel: null,
    });

    expect(result.showModelPicker).toBe(true);
    expect(result.showPersonaSelector).toBe(false);
    expect(result.showTemperaturePicker).toBe(false);
    expect(result.showReasoningPicker).toBe(false);
    expect(result.showAspectRatioPicker).toBe(true);
    expect(result.showImageSettings).toBe(true);
  });

  it("should hide image controls if no API key", () => {
    const result = useVisibleControls({
      generationMode: "image",
      isPrivateMode: false,
      hasReplicateApiKey: false,
      canSend: true,
      selectedModel: null,
    });

    expect(result.showModelPicker).toBe(false);
    expect(result.showAspectRatioPicker).toBe(false);
    expect(result.showImageSettings).toBe(false);
  });

  it("should hide image controls in private mode", () => {
    const result = useVisibleControls({
      generationMode: "image",
      isPrivateMode: true,
      hasReplicateApiKey: true,
      canSend: true,
      selectedModel: null,
    });

    expect(result.showModelPicker).toBe(false);
    expect(result.showAspectRatioPicker).toBe(false);
    expect(result.showImageSettings).toBe(false);
  });

  it("should show reasoning picker when a user model is selected in text mode", () => {
    const validUserModel = {
      _id: "model1",
      modelId: "gpt-4",
      provider: "openai",
      name: "GPT-4",
    };

    const result = useVisibleControls({
      generationMode: "text",
      isPrivateMode: false,
      hasReplicateApiKey: false,
      canSend: true,
      selectedModel: validUserModel as any,
    });

    expect(result.showReasoningPicker).toBe(true);
  });

  it("should hide temperature picker for anonymous users", () => {
    const result = useVisibleControls({
      generationMode: "text",
      isPrivateMode: false,
      hasReplicateApiKey: false,
      canSend: true,
      selectedModel: null,
      isAnonymous: true,
    });

    expect(result.showTemperaturePicker).toBe(false);
  });

  it("should hide temperature picker when user setting is disabled", () => {
    const result = useVisibleControls({
      generationMode: "text",
      isPrivateMode: false,
      hasReplicateApiKey: false,
      canSend: true,
      selectedModel: null,
      hideTemperaturePicker: true,
    });

    expect(result.showTemperaturePicker).toBe(false);
  });

  it("should show temperature picker when user setting is enabled and not anonymous", () => {
    const result = useVisibleControls({
      generationMode: "text",
      isPrivateMode: false,
      hasReplicateApiKey: false,
      canSend: true,
      selectedModel: null,
      isAnonymous: false,
      hideTemperaturePicker: false,
    });

    expect(result.showTemperaturePicker).toBe(true);
  });
});

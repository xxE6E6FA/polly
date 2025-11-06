import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import React, { type PropsWithChildren } from "react";
import type {
  Attachment,
  ConversationId,
  ImageGenerationParams,
} from "@/types";
import { TestProviders } from "../../../../test/TestProviders";

// biome-ignore lint/suspicious/noExplicitAny: Test utility requires any for flexibility
type Stub<T extends (...args: any[]) => any> = T & { calls: Parameters<T>[] };

// biome-ignore lint/suspicious/noExplicitAny: Test utility requires any for flexibility
function createStub<T extends (...args: any[]) => any>(impl: T): Stub<T> {
  const stub = ((...args: Parameters<T>) => {
    (stub as Stub<T>).calls.push(args);
    return impl(...args);
  }) as Stub<T>;
  stub.calls = [];
  return stub;
}

type HistoryStub = {
  prev: Stub<() => string | null>;
  next: Stub<() => string | null>;
  push: Stub<(input: string) => void>;
  resetIndex: Stub<() => void>;
  clear: Stub<() => void>;
};

const originalConsoleError = console.error;

let historyPrevValue: string | null = null;
let historyNextValue: string | null = null;

const createHistoryStub = (): HistoryStub => ({
  prev: createStub(() => historyPrevValue),
  next: createStub(() => historyNextValue),
  push: createStub((_input: string) => {
    // Mock push implementation
  }),
  resetIndex: createStub(() => {
    // Mock reset index implementation
  }),
  clear: createStub(() => {
    // Mock clear implementation
  }),
});

let historyStub: HistoryStub = createHistoryStub();

type CoreStateStub = {
  input: string;
  attachments: Attachment[];
  shouldUsePreservedState: boolean;
  setInput: Stub<(value: string) => void>;
  setAttachments: Stub<
    (value: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void
  >;
  resetCoreState: Stub<() => void>;
};

const createCoreStateStub = (): CoreStateStub => {
  const stub: Partial<CoreStateStub> = {
    input: "initial-input",
    attachments: [],
    shouldUsePreservedState: false,
  };
  stub.setInput = createStub((value: string) => {
    stub.input = value;
  });
  stub.setAttachments = createStub(
    (_value: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
      // Mock set attachments implementation
    }
  );
  stub.resetCoreState = createStub(() => {
    // Mock reset core state implementation
  });
  return stub as CoreStateStub;
};

let coreStateStub: CoreStateStub = createCoreStateStub();

type ImageGenStateStub = {
  generationMode: string;
  imageParams: ImageGenerationParams;
  negativePromptEnabled: boolean;
  setGenerationMode: Stub<(mode: string) => void>;
  setImageParams: Stub<(updater: unknown) => void>;
  setNegativePromptEnabled: Stub<(enabled: boolean) => void>;
  handleNegativePromptEnabledChange: Stub<(enabled: boolean) => void>;
  handleNegativePromptValueChange: Stub<(value: string) => void>;
  resetImageParams: Stub<() => void>;
};

const createImageGenStateStub = (): ImageGenStateStub => ({
  generationMode: "text",
  imageParams: {
    prompt: "",
    model: "default-model",
    aspectRatio: "1:1",
    steps: 20,
    guidanceScale: 7.5,
    count: 1,
    negativePrompt: "",
  },
  negativePromptEnabled: false,
  setGenerationMode: createStub((_mode: string) => {
    // Mock set generation mode
  }),
  setImageParams: createStub((_updater: unknown) => {
    // Mock set image params
  }),
  setNegativePromptEnabled: createStub((_enabled: boolean) => {
    // Mock set negative prompt enabled
  }),
  handleNegativePromptEnabledChange: createStub((_enabled: boolean) => {
    // Mock handle negative prompt enabled change
  }),
  handleNegativePromptValueChange: createStub((_value: string) => {
    // Mock handle negative prompt value change
  }),
  resetImageParams: createStub(() => {
    // Mock reset image params
  }),
});

let imageGenStateStub: ImageGenStateStub = createImageGenStateStub();

const actualChatUIStore = await import("@/stores/chat-ui-store");
mock.module("@/stores/chat-ui-store", () => ({
  ...actualChatUIStore,
  useChatHistory: () => historyStub,
}));

const actualCoreModule = await import("./use-chat-input-core-state");
mock.module("./use-chat-input-core-state", () => ({
  ...actualCoreModule,
  useChatInputCoreState: () => coreStateStub,
}));

const actualImageParamsModule = await import(
  "./use-chat-input-image-generation-params"
);
mock.module("./use-chat-input-image-generation-params", () => ({
  ...actualImageParamsModule,
  useChatInputImageGenerationParams: () => imageGenStateStub,
}));

const { useChatInputState } = await import("./use-chat-input-state");

function Wrapper({ children }: PropsWithChildren) {
  return <TestProviders>{children}</TestProviders>;
}

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    // biome-ignore lint/suspicious/noExplicitAny: Console error mocking requires any
    originalConsoleError(message as any, ...rest);
  }) as typeof console.error;

  historyPrevValue = null;
  historyNextValue = null;
  historyStub = createHistoryStub();
  coreStateStub = createCoreStateStub();
  imageGenStateStub = createImageGenStateStub();
  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe("useChatInputState", () => {
  test("integrates history navigation with core state input setter", () => {
    historyPrevValue = "previous-message";
    const { result } = renderHook(
      () => useChatInputState({ conversationId: "conv-1" as ConversationId }),
      { wrapper: Wrapper }
    );

    expect(result.current.history).toBe(historyStub);
    expect(result.current.input).toBe(coreStateStub.input);
    expect(result.current.attachments).toBe(coreStateStub.attachments);
    expect(result.current.imageParams).toBe(imageGenStateStub.imageParams);
    expect(result.current.enabledImageModels).toBeUndefined();

    let handled: boolean | undefined;
    act(() => {
      handled = result.current.handleHistoryNavigation();
    });

    expect(handled).toBe(true);
    expect(historyStub.prev.calls).toEqual([[]]);
    expect(coreStateStub.setInput.calls).toEqual([["previous-message"]]);
    expect(coreStateStub.input).toBe("previous-message");

    historyPrevValue = null;
    act(() => {
      handled = result.current.handleHistoryNavigation();
    });
    expect(handled).toBe(false);
    expect(coreStateStub.setInput.calls).toHaveLength(1);
  });

  test("applies history navigation down and input change handler", () => {
    historyNextValue = "next-message";
    const { result } = renderHook(
      () => useChatInputState({ conversationId: "conv-2" as ConversationId }),
      { wrapper: Wrapper }
    );

    let handled: boolean | undefined;
    act(() => {
      handled = result.current.handleHistoryNavigationDown();
    });

    expect(handled).toBe(true);
    expect(historyStub.next.calls).toEqual([[]]);
    expect(coreStateStub.setInput.calls).toEqual([["next-message"]]);

    act(() => {
      result.current.handleInputChange("user typing");
    });

    expect(coreStateStub.setInput.calls.at(-1)).toEqual(["user typing"]);
  });

  test("resetInputState resets core state, history index, and image params", () => {
    const { result } = renderHook(
      () => useChatInputState({ conversationId: "conv-3" as ConversationId }),
      { wrapper: Wrapper }
    );

    act(() => {
      result.current.resetInputState();
    });

    expect(coreStateStub.resetCoreState.calls).toEqual([[]]);
    expect(imageGenStateStub.resetImageParams.calls).toEqual([[]]);
    expect(historyStub.resetIndex.calls).toEqual([[]]);
  });
});

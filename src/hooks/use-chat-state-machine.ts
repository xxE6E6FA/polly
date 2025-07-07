import { useCallback, useReducer } from "react";

// State types
export type ChatState =
  | { status: "idle" }
  | { status: "sending"; messageId: string }
  | { status: "streaming"; messageId: string; content: string }
  | { status: "error"; error: Error; retryable: boolean }
  | { status: "stopped"; messageId: string };

// Action types
export type ChatAction =
  | { type: "SEND_MESSAGE"; messageId: string }
  | { type: "STREAM_START"; messageId: string }
  | { type: "STREAM_CHUNK"; content: string }
  | { type: "STREAM_END" }
  | { type: "ERROR"; error: Error; retryable?: boolean }
  | { type: "STOP" }
  | { type: "RESET" };

// Initial state
const initialState: ChatState = { status: "idle" };

// Reducer function
function chatStateReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SEND_MESSAGE":
      return { status: "sending", messageId: action.messageId };

    case "STREAM_START":
      return { status: "streaming", messageId: action.messageId, content: "" };

    case "STREAM_CHUNK":
      if (state.status === "streaming") {
        return { ...state, content: state.content + action.content };
      }
      return state;

    case "STREAM_END":
      return { status: "idle" };

    case "ERROR":
      return {
        status: "error",
        error: action.error,
        retryable: action.retryable ?? true,
      };

    case "STOP":
      if (state.status === "streaming") {
        return { status: "stopped", messageId: state.messageId };
      }
      return state;

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// Hook to use the chat state machine
export function useChatStateMachine() {
  const [state, dispatch] = useReducer(chatStateReducer, initialState);

  const sendMessage = useCallback((messageId: string) => {
    dispatch({ type: "SEND_MESSAGE", messageId });
  }, []);

  const startStreaming = useCallback((messageId: string) => {
    dispatch({ type: "STREAM_START", messageId });
  }, []);

  const addStreamChunk = useCallback((content: string) => {
    dispatch({ type: "STREAM_CHUNK", content });
  }, []);

  const endStreaming = useCallback(() => {
    dispatch({ type: "STREAM_END" });
  }, []);

  const setError = useCallback((error: Error, retryable = true) => {
    dispatch({ type: "ERROR", error, retryable });
  }, []);

  const stopGeneration = useCallback(() => {
    dispatch({ type: "STOP" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  // Derived state for easy consumption
  const isIdle = state.status === "idle";
  const isSending = state.status === "sending";
  const isStreaming = state.status === "streaming";
  const hasError = state.status === "error";
  const isStopped = state.status === "stopped";
  const isActive = isSending || isStreaming;

  return {
    state,
    actions: {
      sendMessage,
      startStreaming,
      addStreamChunk,
      endStreaming,
      setError,
      stopGeneration,
      reset,
    },
    // Convenient boolean flags
    isIdle,
    isSending,
    isStreaming,
    hasError,
    isStopped,
    isActive,
    // Current message being processed
    currentMessageId:
      state.status === "sending" ||
      state.status === "streaming" ||
      state.status === "stopped"
        ? state.messageId
        : null,
    // Stream content (for streaming state)
    streamContent: state.status === "streaming" ? state.content : "",
    // Error details
    error: state.status === "error" ? state.error : null,
    canRetry: state.status === "error" ? state.retryable : false,
  };
}

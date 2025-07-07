import { useCallback, useRef } from "react";
import { preWarmProvider, streamChat } from "@/lib/ai/client-ai-service";
import type { AIProviderType, ChatStreamRequest } from "@/types";

interface UseAIStreamingOptions {
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
}

export function useAIStreaming(options: UseAIStreamingOptions = {}) {
  const { onStreamStart, onStreamEnd } = options;
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (request: ChatStreamRequest) => {
      // Clean up any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        onStreamStart?.();
        await streamChat(request, abortController);
      } finally {
        onStreamEnd?.();
        abortControllerRef.current = null;
      }
    },
    [onStreamStart, onStreamEnd]
  );

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const warmUpProvider = useCallback(
    (provider: AIProviderType, apiKey: string) => {
      return preWarmProvider(provider, apiKey);
    },
    []
  );

  return {
    startStream,
    stopStream,
    warmUpProvider,
    isStreaming: abortControllerRef.current !== null,
  };
}

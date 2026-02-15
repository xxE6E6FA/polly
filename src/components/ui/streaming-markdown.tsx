import { markdownLookBack } from "@llm-ui/markdown";
import { throttleBasic, useLLMOutput } from "@llm-ui/react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  findCompleteNestedCodeBlock,
  findPartialNestedCodeBlock,
  nestedCodeBlockLookBack,
} from "@/lib/nested-code-block-parser";
import { CodeBlockWrapperLLM } from "./code-block-wrapper";
import { MarkdownBlock } from "./markdown-block";

// Context for passing messageId and streaming state to child components
type StreamingContextValue = {
  messageId: string | undefined;
  isStreaming: boolean;
};

const StreamingContext = createContext<StreamingContextValue>({
  messageId: undefined,
  isStreaming: false,
});

export const useIsStreaming = () => useContext(StreamingContext).isStreaming;

// Burst-then-throttle strategy:
// - No throttling for the very first moments to minimize TTFT.
// - After a short burst, enable a light throttle to reduce CPU and re-render load.
const BURST_MS = 250; // initial window with minimal throttle
const BURST_CHARS = 80; // or until this many chars have arrived
const BURST_THROTTLE = {
  readAheadChars: 1,
  targetBufferChars: 8,
  adjustPercentage: 0.15,
  frameLookBackMs: 80,
  windowLookBackMs: 80,
} as const;
const THROTTLE_CONFIG = {
  readAheadChars: 2,
  targetBufferChars: 16,
  adjustPercentage: 0.12,
  frameLookBackMs: 110,
  windowLookBackMs: 100,
} as const;

// Remove common streaming cursor/indicator glyphs that some renderers append
// We only strip these when actively streaming to avoid altering legitimate output
const TRAILING_ZERO_WIDTH = /(?:\u200B|\u200C|\u200D|\uFEFF|\u2060|\u00AD)+$/;
const TRAILING_BOX_DRAWING = /[\u2500-\u257F\u2580-\u259F\u2758-\u275A]+$/;

function stripTrailingStreamingArtifacts(text: string): string {
  if (!text) {
    return text;
  }
  // Remove zero-width/control artifacts first, then heavy box/cursor glyphs
  return text
    .replace(TRAILING_ZERO_WIDTH, "")
    .replace(TRAILING_BOX_DRAWING, "");
}

type StreamingMarkdownProps = {
  children: string;
  className?: string;
  isStreaming?: boolean;
  messageId?: string;
};

const StreamingMarkdownInner = memo(
  ({
    children,
    className,
    isStreaming = false,
    messageId,
  }: StreamingMarkdownProps) => {
    // Memoize block config to prevent unnecessary recalculations
    const blockConfig = useMemo(
      () => ({
        fallbackBlock: {
          component: MarkdownBlock,
          lookBack: markdownLookBack(),
        },
        blocks: [
          {
            component: CodeBlockWrapperLLM,
            findCompleteMatch: findCompleteNestedCodeBlock(),
            findPartialMatch: findPartialNestedCodeBlock(),
            lookBack: nestedCodeBlockLookBack(),
          },
        ],
      }),
      []
    );

    // Optimize throttle based on content length during streaming
    const streamStartRef = useRef<number | null>(null);
    const [fps, setFps] = useState<number | null>(null);
    // Track when streaming begins to establish burst window
    useEffect(() => {
      if (isStreaming && streamStartRef.current === null) {
        streamStartRef.current = performance.now();
      }
      if (!isStreaming) {
        streamStartRef.current = null;
      }
    }, [isStreaming]);

    // Lightweight FPS sampler during the first second of streaming
    useEffect(() => {
      if (!isStreaming) {
        return;
      }
      let rafId = 0;
      let frames = 0;
      let last = performance.now();
      let totalDelta = 0;
      const sample = () => {
        const now = performance.now();
        totalDelta += now - last;
        last = now;
        frames++;
        if (frames < 30) {
          rafId = requestAnimationFrame(sample);
        } else {
          const avgDelta = totalDelta / Math.max(frames, 1);
          const measuredFps = 1000 / Math.max(avgDelta, 1);
          setFps(measuredFps);
        }
      };
      rafId = requestAnimationFrame(sample);
      return () => cancelAnimationFrame(rafId);
    }, [isStreaming]);

    const optimizedThrottle = useMemo(() => {
      if (!isStreaming) {
        return undefined;
      }
      const now = performance.now();
      const startedAt = streamStartRef.current ?? now;
      const inBurstWindow =
        now - startedAt < BURST_MS || children.length < BURST_CHARS;
      if (inBurstWindow) {
        return throttleBasic(BURST_THROTTLE);
      }
      const lowFps = fps !== null && fps < 45;
      const cfg = lowFps
        ? {
            ...THROTTLE_CONFIG,
            targetBufferChars: 28,
            frameLookBackMs: 180,
            windowLookBackMs: 150,
          }
        : THROTTLE_CONFIG;
      return throttleBasic(cfg);
    }, [isStreaming, children.length, fps]);

    const { blockMatches } = useLLMOutput({
      llmOutput: children,
      fallbackBlock: blockConfig.fallbackBlock,
      blocks: blockConfig.blocks,
      isStreamFinished: !isStreaming,
      throttle: optimizedThrottle,
    });

    // Memoize the rendered components to reduce re-renders
    const renderedBlocks = useMemo(() => {
      return blockMatches.map((blockMatch, index) => {
        const Component = blockMatch.block.component;
        const stableKey = `${Component.name || "component"}-${index}`;
        return <Component key={stableKey} blockMatch={blockMatch} />;
      });
    }, [blockMatches]);

    const contextValue = useMemo(
      () => ({ messageId, isStreaming }),
      [messageId, isStreaming]
    );

    return (
      <StreamingContext.Provider value={contextValue}>
        <div
          className={`${className ?? ""} selectable-text break-words text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8]`}
        >
          {renderedBlocks}
        </div>
      </StreamingContext.Provider>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for streaming performance
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }

    if (prevProps.children !== nextProps.children) {
      return false;
    }

    if (prevProps.className !== nextProps.className) {
      return false;
    }

    if (prevProps.messageId !== nextProps.messageId) {
      return false;
    }

    return true;
  }
);

StreamingMarkdownInner.displayName = "StreamingMarkdownInner";

const StreamingMarkdownComponent = ({
  children,
  className,
  isStreaming = false,
  messageId,
}: StreamingMarkdownProps) => {
  const [frozenContent, setFrozenContent] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const wasStreamingRef = useRef(isStreaming);
  const lastContentLengthRef = useRef(children.length);

  // Enhanced state management for better performance
  const updateFrozenContent = useCallback(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setFrozenContent(children);
      setStreamKey(prev => prev + 1);
    } else if (!wasStreamingRef.current && isStreaming) {
      setFrozenContent(null);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, children]);

  useEffect(() => {
    updateFrozenContent();
  }, [updateFrozenContent]);

  // Performance monitoring in development
  useEffect(() => {
    if (import.meta.env.DEV && isStreaming) {
      const contentGrowth = children.length - lastContentLengthRef.current;
      if (contentGrowth > 0) {
        // Content growth tracking for development debugging
      }
      lastContentLengthRef.current = children.length;
    }
  }, [children.length, isStreaming]);

  // Use frozen content when available (after stop), otherwise use live content
  const contentToRender = frozenContent !== null ? frozenContent : children;
  const isLiveStreaming = isStreaming && frozenContent === null;
  const sanitizedContent = isLiveStreaming
    ? stripTrailingStreamingArtifacts(contentToRender)
    : contentToRender;

  return (
    <StreamingMarkdownInner
      key={`${messageId}-${streamKey}`}
      className={className}
      isStreaming={isLiveStreaming}
      messageId={messageId}
    >
      {sanitizedContent}
    </StreamingMarkdownInner>
  );
};

export const StreamingMarkdown = memo(
  StreamingMarkdownComponent,
  (prevProps, nextProps) => {
    // Simpler comparison to ensure smooth streaming updates
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }
    if (prevProps.children !== nextProps.children) {
      return false;
    }
    if (prevProps.className !== nextProps.className) {
      return false;
    }
    if (prevProps.messageId !== nextProps.messageId) {
      return false;
    }
    return true;
  }
);

StreamingMarkdown.displayName = "StreamingMarkdown";

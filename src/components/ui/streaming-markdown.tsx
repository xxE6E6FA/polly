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

import { CodeBlockWrapperLLM } from "./code-block-wrapper";
import { MarkdownBlock } from "./markdown-block";
import {
  findCompleteNestedCodeBlock,
  findPartialNestedCodeBlock,
  nestedCodeBlockLookBack,
} from "./nested-code-block-parser";

// Context for passing messageId to child components
const MessageContext = createContext<string | undefined>(undefined);
export const useMessageId = () => useContext(MessageContext);

// Optimized throttling with content-aware adjustments
const createOptimizedThrottle = (contentLength: number) => {
  // Adjust throttling based on content length for better performance
  const baseTargetChars = Math.min(50, Math.max(10, contentLength / 100));

  return throttleBasic({
    readAheadChars: Math.max(1, Math.floor(baseTargetChars / 10)),
    targetBufferChars: baseTargetChars,
    adjustPercentage: contentLength > 1000 ? 0.05 : 0.1, // Less aggressive for long content
    frameLookBackMs: contentLength > 2000 ? 1500 : 1000,
    windowLookBackMs: contentLength > 2000 ? 750 : 500,
  });
};

// Default throttle tuned for responsive streaming
const defaultThrottle = throttleBasic({
  readAheadChars: 1,
  targetBufferChars: 6,
  adjustPercentage: 0.2,
  frameLookBackMs: 200,
  windowLookBackMs: 120,
});

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
    const optimizedThrottle = useMemo(() => {
      if (!isStreaming) {
        return undefined;
      }
      return children.length > 100
        ? createOptimizedThrottle(children.length)
        : defaultThrottle;
    }, [isStreaming, children.length]);

    const { blockMatches } = useLLMOutput({
      llmOutput: children,
      fallbackBlock: blockConfig.fallbackBlock,
      blocks: blockConfig.blocks,
      isStreamFinished: !isStreaming,
      throttle: optimizedThrottle,
    });

    // debug logs removed

    // Memoize the rendered components to reduce re-renders
    const renderedBlocks = useMemo(() => {
      return blockMatches.map((blockMatch, index) => {
        const Component = blockMatch.block.component;
        const stableKey = `${Component.name || "component"}-${index}`;
        return <Component key={stableKey} blockMatch={blockMatch} />;
      });
    }, [blockMatches]);

    return (
      <MessageContext.Provider value={messageId}>
        <div
          className={`${className ?? ""} selectable-text text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8] max-w-[72ch]`}
        >
          {renderedBlocks}
        </div>
      </MessageContext.Provider>
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
    if (process.env.NODE_ENV === "development" && isStreaming) {
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

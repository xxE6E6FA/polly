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

// Default throttle for initial render
const defaultThrottle = throttleBasic({
  readAheadChars: 1,
  targetBufferChars: 20,
  adjustPercentage: 0.1,
  frameLookBackMs: 1000,
  windowLookBackMs: 500,
});

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

    // Memoize the rendered components to reduce re-renders
    const renderedBlocks = useMemo(() => {
      return blockMatches.map((blockMatch, index) => {
        const Component = blockMatch.block.component;
        return (
          <Component
            key={`${index}-${Component.name || "component"}-${blockMatch.output.length}`}
            blockMatch={blockMatch}
          />
        );
      });
    }, [blockMatches]);

    return (
      <MessageContext.Provider value={messageId}>
        <div className={`${className} selectable-text`}>{renderedBlocks}</div>
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

  return (
    <StreamingMarkdownInner
      key={`${messageId}-${streamKey}`}
      className={className}
      isStreaming={isStreaming && frozenContent === null}
      messageId={messageId}
    >
      {contentToRender}
    </StreamingMarkdownInner>
  );
};

export const StreamingMarkdown = memo(
  StreamingMarkdownComponent,
  (prevProps, nextProps) => {
    // Enhanced comparison for streaming performance
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false; // Always re-render when streaming state changes
    }

    if (nextProps.isStreaming) {
      // During streaming, implement smart batching
      const prevLength = prevProps.children.length;
      const nextLength = nextProps.children.length;
      const lengthDiff = nextLength - prevLength;

      // Only re-render if we have meaningful content growth
      if (
        lengthDiff >= 15 || // Batch threshold for better performance
        (lengthDiff > 0 && nextLength % 100 === 0) || // Periodic updates for long content
        (nextProps.children !== prevProps.children && nextLength < 50)
      ) {
        // Always update for short content
        return false;
      }

      return true; // Skip re-render for small changes
    }

    // Not streaming, compare normally
    return (
      prevProps.children === nextProps.children &&
      prevProps.className === nextProps.className &&
      prevProps.messageId === nextProps.messageId
    );
  }
);

StreamingMarkdown.displayName = "StreamingMarkdown";

import {
  memo,
  useMemo,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  codeBlockLookBack,
  findCompleteCodeBlock,
  findPartialCodeBlock,
} from "@llm-ui/code";
import { markdownLookBack } from "@llm-ui/markdown";
import { useLLMOutput, throttleBasic } from "@llm-ui/react";
import { MarkdownBlock } from "./markdown-block";
import { CodeBlockWrapperLLM } from "./code-block-wrapper";

// Context for passing messageId to child components
const MessageContext = createContext<string | undefined>(undefined);
export const useMessageId = () => useContext(MessageContext);

const throttle = throttleBasic({
  readAheadChars: 10,
  targetBufferChars: 9,
  adjustPercentage: 0.2,
  frameLookBackMs: 10000,
  windowLookBackMs: 2000,
});

interface StreamingMarkdownProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  messageId?: string;
}

function StreamingMarkdownInner({
  children,
  className,
  isStreaming = false,
  messageId,
}: StreamingMarkdownProps) {
  const blockConfig = useMemo(
    () => ({
      fallbackBlock: {
        component: MarkdownBlock,
        lookBack: markdownLookBack(),
      },
      blocks: [
        {
          component: CodeBlockWrapperLLM,
          findCompleteMatch: findCompleteCodeBlock(),
          findPartialMatch: findPartialCodeBlock(),
          lookBack: codeBlockLookBack(),
        },
      ],
    }),
    []
  );

  const { blockMatches } = useLLMOutput({
    llmOutput: children,
    fallbackBlock: blockConfig.fallbackBlock,
    blocks: blockConfig.blocks,
    isStreamFinished: !isStreaming,
    throttle: isStreaming ? throttle : undefined,
  });

  return (
    <MessageContext.Provider value={messageId}>
      <div className={className}>
        {blockMatches.map((blockMatch, index) => {
          const Component = blockMatch.block.component;
          return (
            <Component
              key={`${index}-${Component.name || "component"}`}
              blockMatch={blockMatch}
            />
          );
        })}
      </div>
    </MessageContext.Provider>
  );
}

function StreamingMarkdownComponent({
  children,
  className,
  isStreaming = false,
  messageId,
}: StreamingMarkdownProps) {
  const [frozenContent, setFrozenContent] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setFrozenContent(children);
      setStreamKey(prev => prev + 1);
    } else if (!wasStreamingRef.current && isStreaming) {
      setFrozenContent(null);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, children]);

  // Use frozen content when available (after stop), otherwise use live content
  const contentToRender = frozenContent !== null ? frozenContent : children;

  return (
    <StreamingMarkdownInner
      key={`${messageId}-${streamKey}`}
      children={contentToRender}
      className={className}
      isStreaming={isStreaming && frozenContent === null}
      messageId={messageId}
    />
  );
}

export const StreamingMarkdown = memo(
  StreamingMarkdownComponent,
  (prevProps, nextProps) => {
    // Always re-render when streaming state changes to ensure proper freezing
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }

    // During streaming, only re-render if content has meaningful changes
    if (nextProps.isStreaming) {
      const sizeDiff = Math.abs(
        nextProps.children.length - prevProps.children.length
      );
      // Only re-render if content difference is significant
      return sizeDiff < 10;
    }

    // Not streaming, compare normally
    return (
      prevProps.children === nextProps.children &&
      prevProps.className === nextProps.className
    );
  }
);

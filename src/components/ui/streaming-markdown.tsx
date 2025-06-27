import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { markdownLookBack } from "@llm-ui/markdown";
import { throttleBasic, useLLMOutput } from "@llm-ui/react";

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

const throttle = throttleBasic({
  readAheadChars: 1,
  targetBufferChars: 0,
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

const StreamingMarkdownInner = ({
  children,
  className,
  isStreaming = false,
  messageId,
}: StreamingMarkdownProps) => {
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
};

const StreamingMarkdownComponent = ({
  children,
  className,
  isStreaming = false,
  messageId,
}: StreamingMarkdownProps) => {
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
      children={contentToRender}
      key={`${messageId}-${streamKey}`}
      className={className}
      isStreaming={isStreaming && frozenContent === null}
      messageId={messageId}
    />
  );
};

export const StreamingMarkdown = memo(
  StreamingMarkdownComponent,
  (prevProps, nextProps) => {
    // Always re-render when streaming state changes to ensure proper freezing
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }

    // During streaming, always re-render if content changes at all
    if (nextProps.isStreaming) {
      // If content has changed, re-render (return false means "props are not equal, re-render")
      return prevProps.children === nextProps.children;
    }

    // Not streaming, compare normally
    return (
      prevProps.children === nextProps.children &&
      prevProps.className === nextProps.className
    );
  }
);

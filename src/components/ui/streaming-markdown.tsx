import { memo, useMemo, createContext, useContext } from "react";
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

interface StreamingMarkdownProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  messageId?: string;
}

function StreamingMarkdownComponent({
  children,
  className,
  isStreaming = false,
  messageId,
}: StreamingMarkdownProps) {
  // Memoize block configuration to prevent recreation
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

  // Configure throttling for smoother streaming experience
  const throttle = useMemo(
    () =>
      throttleBasic({
        readAheadChars: 10,
        targetBufferChars: 9,
        adjustPercentage: 0.2,
        frameLookBackMs: 10000,
        windowLookBackMs: 2000,
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

export const StreamingMarkdown = memo(
  StreamingMarkdownComponent,
  (prevProps, nextProps) => {
    // Custom comparison for better memoization during streaming
    if (
      prevProps.isStreaming !== nextProps.isStreaming ||
      prevProps.className !== nextProps.className
    ) {
      return false;
    }

    // During streaming, only re-render if content has meaningful changes
    if (nextProps.isStreaming) {
      const sizeDiff = Math.abs(
        nextProps.children.length - prevProps.children.length
      );
      // Only re-render if content difference is significant (more than 50 characters)
      return sizeDiff < 10;
    }

    // Not streaming, compare normally
    return prevProps.children === nextProps.children;
  }
);

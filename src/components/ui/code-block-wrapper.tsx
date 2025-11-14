import type { LLMOutputComponent } from "@llm-ui/react";
import { lazy, Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { extractFirstCodeBlock } from "./nested-code-block-parser";

const CodeBlock = lazy(() =>
  import("./code-block").then(m => ({ default: m.CodeBlock }))
);

type CodeBlockWrapperProps = {
  code: string;
  language?: string;
  className?: string;
};

// Simple loading placeholder that matches the code block height

const CodeBlockSkeleton = () => {
  return <Skeleton className="mt-2 h-32 w-full rounded-lg" />;
};

// Direct usage component

export const CodeBlockWrapper = (props: CodeBlockWrapperProps) => {
  return (
    <Suspense fallback={<CodeBlockSkeleton />}>
      <CodeBlock {...props} />
    </Suspense>
  );
};

// LLM output component for streaming markdown
export const CodeBlockWrapperLLM: LLMOutputComponent = ({ blockMatch }) => {
  // Use our custom parser to handle nested code blocks properly
  const codeBlock = extractFirstCodeBlock(blockMatch.output);

  if (codeBlock) {
    return (
      <CodeBlockWrapper
        className="my-4"
        code={codeBlock.code}
        language={codeBlock.language || "text"}
      />
    );
  }

  // Fallback to old logic if custom parser fails
  const lines = blockMatch.output.split("\n");
  const firstLine = lines[0] ?? "";
  const language = firstLine.startsWith("```")
    ? firstLine.slice(3).trim()
    : "text";

  // Simple extraction as fallback
  const code = lines.slice(1, -1).join("\n");

  return <CodeBlockWrapper className="my-4" code={code} language={language} />;
};

import { lazy, Suspense } from "react";

import { type LLMOutputComponent } from "@llm-ui/react";

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
  return (
    <div className="group relative mt-2 flex w-full flex-col pt-9">
      <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-between rounded-t border border-b-0 bg-black/[0.03] px-4 py-2 dark:bg-white/[0.06]">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-1">
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="relative rounded-b-lg border bg-black/[0.02] p-4 dark:bg-white/[0.04]">
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
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
  // Extract language from the first line if it's a markdown code block
  const lines = blockMatch.output.split("\n");
  const firstLine = lines[0];
  const language = firstLine.startsWith("```")
    ? firstLine.slice(3).trim()
    : "text";

  // Get the actual code content (remove ``` markers)
  const code = lines.slice(1, -1).join("\n");

  return <CodeBlockWrapper className="my-4" code={code} language={language} />;
};

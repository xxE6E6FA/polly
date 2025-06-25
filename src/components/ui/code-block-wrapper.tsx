import { lazy, Suspense } from "react";
import { type LLMOutputComponent } from "@llm-ui/react";

const CodeBlock = lazy(() =>
  import("./code-block").then(m => ({ default: m.CodeBlock }))
);

interface CodeBlockWrapperProps {
  code: string;
  language?: string;
  className?: string;
}

// Simple loading placeholder that matches the code block height
function CodeBlockSkeleton() {
  return (
    <div className="group relative mt-2 flex w-full flex-col pt-9">
      <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-between rounded-t bg-black/[0.03] dark:bg-white/[0.06] border border-b-0 px-4 py-2">
        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        <div className="flex items-center gap-1">
          <div className="h-7 w-7 bg-muted animate-pulse rounded" />
          <div className="h-7 w-7 bg-muted animate-pulse rounded" />
          <div className="h-7 w-7 bg-muted animate-pulse rounded" />
        </div>
      </div>
      <div className="relative bg-black/[0.02] dark:bg-white/[0.04] border rounded-b-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
          <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

// Direct usage component
export function CodeBlockWrapper(props: CodeBlockWrapperProps) {
  return (
    <Suspense fallback={<CodeBlockSkeleton />}>
      <CodeBlock {...props} />
    </Suspense>
  );
}

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

  return <CodeBlockWrapper code={code} language={language} className="my-4" />;
};

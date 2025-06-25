import { type LLMOutputComponent } from "@llm-ui/react";
import { CodeBlock } from "@/components/ui/code-block";

// Simple wrapper for llm-ui code blocks
export const CodeBlockWrapper: LLMOutputComponent = ({ blockMatch }) => {
  // Extract language from the first line if it's a markdown code block
  const lines = blockMatch.output.split("\n");
  const firstLine = lines[0];
  const language = firstLine.startsWith("```")
    ? firstLine.slice(3).trim()
    : "text";

  // Get the actual code content (remove ``` markers)
  const code = lines.slice(1, -1).join("\n");

  return <CodeBlock code={code} language={language} className="my-4" />;
};

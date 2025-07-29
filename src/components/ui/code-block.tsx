import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  TextAlignJustifyIcon,
} from "@phosphor-icons/react";
import { Highlight } from "prism-react-renderer";
import { memo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { darkSyntaxTheme, lightSyntaxTheme } from "@/lib/syntax-themes";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language?: string;
  className?: string;
};

const CodeBlockComponent = ({
  code,
  language = "text",
  className,
}: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const { theme } = useTheme();
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const processedCode = code;
  const processedLanguage = language;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(processedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      const { toast } = await import("sonner");
      toast.error("Failed to copy code", {
        description: "Unable to copy code to clipboard. Please try again.",
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([processedCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${getFileExtension(processedLanguage)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFileExtension = (lang: string): string => {
    const extensions: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      python: "py",
      java: "java",
      cpp: "cpp",
      c: "c",
      csharp: "cs",
      php: "php",
      ruby: "rb",
      go: "go",
      rust: "rs",
      swift: "swift",
      kotlin: "kt",
      scala: "scala",
      html: "html",
      css: "css",
      scss: "scss",
      less: "less",
      json: "json",
      xml: "xml",
      yaml: "yml",
      yml: "yml",
      sql: "sql",
      bash: "sh",
      shell: "sh",
      powershell: "ps1",
      dockerfile: "dockerfile",
      markdown: "md",
      text: "txt",
    };
    return extensions[lang.toLowerCase()] || "txt";
  };

  return (
    <div
      className={cn("group relative mt-2 flex w-full flex-col pt-9", className)}
    >
      {/* Header with language and actions */}
      <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-between rounded-t border border-b-0 bg-black/[0.03] px-4 py-2 text-sm dark:bg-white/[0.06]">
        <span className="font-mono font-medium text-muted-foreground">
          {processedLanguage || "text"}
        </span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7 p-0 hover:bg-muted-foreground/10"
                size="sm"
                variant="ghost"
                onClick={handleDownload}
              >
                <DownloadIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download code</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 w-7 p-0 hover:bg-muted-foreground/10",
                  wordWrap && "bg-accent"
                )}
                onClick={() => setWordWrap(!wordWrap)}
              >
                <TextAlignJustifyIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{wordWrap ? "Disable word wrap" : "Enable word wrap"}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7 p-0 transition-colors hover:bg-muted-foreground/10"
                size="sm"
                variant="ghost"
                onClick={handleCopy}
              >
                <div className="relative h-4 w-4">
                  {copied ? (
                    <CheckIcon className="absolute inset-0 h-3 w-3 text-[hsl(220_95%_55%)] transition-all duration-200" />
                  ) : (
                    <CopyIcon className="absolute inset-0 h-3 w-3 transition-all duration-200" />
                  )}
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy code</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Code content */}
      <div
        ref={codeContainerRef}
        className="relative rounded-b-lg border bg-black/[0.02] dark:bg-white/[0.04]"
      >
        <Highlight
          code={processedCode.trim()}
          language={processedLanguage}
          theme={theme === "dark" ? darkSyntaxTheme : lightSyntaxTheme}
        >
          {({
            className: highlightClassName,
            style,
            tokens,
            getLineProps,
            getTokenProps,
          }) => (
            <pre
              className={cn(
                highlightClassName,
                "m-0 overflow-x-auto p-4 text-sm font-mono",
                wordWrap && "whitespace-pre-wrap break-words overflow-x-visible"
              )}
              style={{
                ...style,
                fontFamily:
                  'var(--font-geist-mono), "Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                backgroundColor: "transparent",
              }}
            >
              {tokens.map((line, i) => (
                <div key={`line-${i}`} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span
                      key={`token-${i}-${key}`}
                      {...getTokenProps({ token })}
                    />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
};

export const CodeBlock = memo(CodeBlockComponent);

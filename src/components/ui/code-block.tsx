import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  TextAlignJustifyIcon,
} from "@phosphor-icons/react";
import { Highlight } from "prism-react-renderer";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { darkSyntaxTheme, lightSyntaxTheme } from "@/lib/syntax-themes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

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
  const managedToast = useToast();
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);

  const processedCode = code;
  const processedLanguage = language;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(processedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      managedToast.error("Failed to copy code", {
        description: "Unable to copy code to clipboard. Please try again.",
      });
    }
  }, [processedCode, managedToast]);

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

  // Handle keyboard shortcut for copying (Cmd+Shift+C / Ctrl+Shift+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!componentRef.current) {
        return;
      }

      // Check if the code block is in view or focused
      const rect = componentRef.current.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key === "C" &&
        isVisible
      ) {
        e.preventDefault();
        handleCopy();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCopy]);

  return (
    <div className="group" ref={componentRef}>
      <div className={cn("relative mt-2 flex w-full flex-col pt-9", className)}>
        {/* Header with language and actions */}
        <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-between rounded-t border border-b-0 bg-surface-variant px-4 py-2 text-sm">
          <span className="font-mono font-medium text-muted-foreground">
            {processedLanguage || "text"}
          </span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
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
                    "h-7 w-7 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    wordWrap && "bg-accent/50 text-foreground"
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
                  className="h-7 w-7 p-0 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                >
                  <div className="relative h-4 w-4">
                    {copied ? (
                      <CheckIcon className="absolute inset-0 h-3 w-3 text-primary transition-all duration-200" />
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

        {/* Sticky copy button - positioned to align perfectly with header button */}
        <div className="sticky left-auto z-[1] ml-auto h-1.5 w-7 transition-[top] top-[42px]">
          <div className="absolute -top-8 right-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-7 w-7 p-0 border-none relative top-[0.5px] -left-[1px] rounded border bg-surface text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  aria-label="Copy code to clipboard"
                >
                  <div className="relative h-4 w-4">
                    {copied ? (
                      <CheckIcon className="absolute inset-0 h-3 w-3 text-primary transition-all duration-200" />
                    ) : (
                      <CopyIcon className="absolute inset-0 h-3 w-3 transition-all duration-200" />
                    )}
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy code (Cmd+Shift+C)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Spacer to adjust layout - matches reference */}
        <div className="-mb-1.5" />

        {/* Code content */}
        <div
          ref={codeContainerRef}
          className="relative rounded-b-lg border bg-muted"
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
                  wordWrap &&
                    "whitespace-pre-wrap break-words overflow-x-visible"
                )}
                style={{
                  ...style,
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
    </div>
  );
};

export const CodeBlock = memo(CodeBlockComponent);

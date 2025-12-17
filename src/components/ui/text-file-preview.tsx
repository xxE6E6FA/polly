import { CheckIcon, CopyIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { Highlight } from "prism-react-renderer";
import { memo, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { getFileLanguage } from "@/lib/file-utils";
import { darkSyntaxTheme, lightSyntaxTheme } from "@/lib/syntax-themes";
import { cn } from "@/lib/utils";

type TextFilePreviewProps = {
  content: string;
  filename: string;
  className?: string;
};

const TextFilePreviewComponent = ({
  content,
  filename,
  className,
}: TextFilePreviewProps) => {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const language = getFileLanguage(filename);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      // Silent fail for copy
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, filename]);

  return (
    <div
      className={cn(
        "group/preview relative flex h-full w-full flex-col overflow-hidden rounded-lg",
        "bg-card/80 backdrop-blur-sm border border-border/50",
        className
      )}
    >
      {/* Minimal header with filename */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <span className="truncate text-sm font-medium text-foreground/80">
          {filename}
        </span>
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
          {language}
        </span>
      </div>

      {/* Action buttons - appear on hover */}
      <div
        className={cn(
          "absolute right-3 top-12 z-10 flex gap-1",
          "opacity-0 transition-opacity duration-200 group-hover/preview:opacity-100"
        )}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="h-8 w-8 p-0 shadow-md"
          aria-label="Copy content"
        >
          {copied ? (
            <CheckIcon className="h-4 w-4 text-primary" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownload}
          className="h-8 w-8 p-0 shadow-md"
          aria-label="Download file"
        >
          <DownloadSimpleIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto">
        <Highlight
          code={content.trim()}
          language={language}
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
                "m-0 min-h-full p-4 text-[13px] leading-relaxed font-mono",
                "whitespace-pre-wrap break-words"
              )}
              style={{
                ...style,
                backgroundColor: "transparent",
              }}
            >
              {tokens.map((line, i) => (
                <div
                  key={line.map(t => t.content).join("-")}
                  {...getLineProps({ line, key: i })}
                >
                  {line.map((token, key) => (
                    <span
                      key={`${token.content}-${key}`}
                      {...getTokenProps({ token, key })}
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

export const TextFilePreview = memo(TextFilePreviewComponent);

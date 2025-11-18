import { CloudSlashIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";

type OfflinePlaceholderProps = {
  title?: string;
  description?: string;
  showHomeLink?: boolean;
  onRetry?: () => void;
};

export function OfflinePlaceholder({
  title = "You're offline",
  description = "We can't load this content without an internet connection.",
  showHomeLink = true,
  onRetry,
}: OfflinePlaceholderProps) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center stack-xl bg-background/50 p-8 text-center animate-in fade-in-0 zoom-in-95">
          <CloudSlashIcon className="h-12 w-12 text-muted-foreground" />
          <div className="stack-sm">
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
            <p className="mx-auto max-w-md text-base text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            {onRetry && (
              <Button size="lg" onClick={onRetry} className="gap-2">
                Retry
              </Button>
            )}
            {showHomeLink && (
              <Link
                to="/"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Go Home
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

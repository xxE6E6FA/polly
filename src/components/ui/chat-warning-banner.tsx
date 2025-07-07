import { XIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

// Constants for shared styles
const WARNING_BANNER_CLASSES =
  "absolute -top-4 left-1/2 transform -translate-x-1/2 z-10";
const WARNING_CONTENT_CLASSES =
  "inline-flex items-center gap-2 p-1.5 rounded-md transition-all duration-200 text-xs shadow-lg h-7 whitespace-nowrap";
const WARNING_BUTTON_CLASSES = "p-0.5 rounded transition-colors duration-150";

type WarningMessage = {
  text: string;
  link?: { text: string; href: string };
  suffix?: string;
};

type ChatWarningBannerProps = {
  type: "warning" | "error";
  message: WarningMessage;
  onDismiss?: () => void;
  variant?: "floating" | "stable";
};

export const ChatWarningBanner = ({
  type,
  message,
  onDismiss,
  variant = "floating",
}: ChatWarningBannerProps) => {
  const isWarning = type === "warning";
  const isStable = variant === "stable";

  const contentClasses = cn(
    WARNING_CONTENT_CLASSES,
    isWarning
      ? "bg-warning-bg text-warning-foreground border border-warning-border"
      : "bg-danger-bg text-danger border border-danger-border"
  );

  const buttonClasses = cn(
    WARNING_BUTTON_CLASSES,
    isWarning
      ? "hover:bg-warning-foreground/10 text-warning-foreground"
      : "hover:bg-danger/10 text-danger"
  );

  const containerClasses = isStable
    ? "flex justify-center"
    : WARNING_BANNER_CLASSES;

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>
        <span className="select-none">
          {message.text}
          {message.link && (
            <>
              {" "}
              <Link
                to={message.link.href}
                className={cn(
                  "underline underline-offset-2 transition-all duration-150",
                  isWarning
                    ? "hover:text-warning-foreground/80"
                    : "hover:text-danger/80"
                )}
              >
                {message.link.text}
              </Link>
            </>
          )}
          {message.suffix && (
            <>
              {" "}
              <span>{message.suffix}</span>
            </>
          )}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={buttonClasses}
            aria-label="Dismiss warning"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};

ChatWarningBanner.displayName = "ChatWarningBanner";

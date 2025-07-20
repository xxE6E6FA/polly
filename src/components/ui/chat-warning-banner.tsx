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
      ? "bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/50"
      : "bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800/50"
  );

  const buttonClasses = cn(
    WARNING_BUTTON_CLASSES,
    isWarning
      ? "hover:bg-amber-100 text-amber-700 dark:hover:bg-amber-900/50 dark:text-amber-300"
      : "hover:bg-red-100 text-red-700 dark:hover:bg-red-900/50 dark:text-red-300"
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
                    ? "hover:text-amber-800 dark:hover:text-amber-100"
                    : "hover:text-red-800 dark:hover:text-red-100"
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

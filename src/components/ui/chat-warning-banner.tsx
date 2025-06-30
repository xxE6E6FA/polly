import React from "react";
import { Link } from "react-router";
import { XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// Constants for shared styles
const WARNING_BANNER_CLASSES =
  "absolute -top-7 left-1/2 transform -translate-x-1/2 z-10";
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
};

export const ChatWarningBanner = React.memo<ChatWarningBannerProps>(
  ({ type, message, onDismiss }) => {
    const isWarning = type === "warning";
    const colorClasses = isWarning
      ? "bg-amber-50 dark:bg-amber-950/90 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 backdrop-blur-sm"
      : "bg-red-50 dark:bg-red-950/90 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 backdrop-blur-sm";

    const buttonHoverClasses = isWarning
      ? "hover:bg-amber-100 dark:hover:bg-amber-900/50"
      : "hover:bg-red-100 dark:hover:bg-red-900/50";

    return (
      <div className={WARNING_BANNER_CLASSES}>
        <div className={cn(WARNING_CONTENT_CLASSES, colorClasses)}>
          <div>
            {message.text}
            {message.link && (
              <>
                {" "}
                <Link
                  className="font-medium underline underline-offset-2 hover:no-underline"
                  to={message.link.href}
                >
                  {message.link.text}
                </Link>{" "}
              </>
            )}
            {message.suffix && <> {message.suffix}</>}
          </div>
          {onDismiss && (
            <button
              aria-label="Dismiss"
              className={cn(WARNING_BUTTON_CLASSES, buttonHoverClasses)}
              onClick={onDismiss}
            >
              <XIcon className="h-3.5 w-3.5 hover:opacity-80" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

ChatWarningBanner.displayName = "ChatWarningBanner";

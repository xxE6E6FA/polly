import { ChatWarningBanner } from "@/components/ui/chat-warning-banner";
import { cn } from "@/lib/utils";

type WarningMessage = {
  text: string;
  link?: { text: string; href: string };
  suffix?: string;
};

interface WarningBannersProps {
  warnings: {
    showLimitWarning: boolean;
    showLimitReached: boolean;
    limitWarningMessage: WarningMessage;
    limitReachedMessage: WarningMessage;
    dismissWarning: () => void;
  };
  hasExistingMessages?: boolean;
}

export function WarningBanners({
  warnings,
  hasExistingMessages,
}: WarningBannersProps) {
  const hasWarnings = warnings.showLimitWarning || warnings.showLimitReached;

  if (!hasWarnings) {
    return null;
  }

  if (!hasExistingMessages) {
    return (
      <div
        className={cn(
          "flex justify-center h-7 mb-3 transition-opacity duration-200",
          !hasWarnings && "opacity-0"
        )}
      >
        {warnings.showLimitWarning && !warnings.showLimitReached && (
          <ChatWarningBanner
            type="warning"
            message={warnings.limitWarningMessage}
            onDismiss={warnings.dismissWarning}
            variant="stable"
          />
        )}

        {warnings.showLimitReached && (
          <ChatWarningBanner
            type="error"
            message={warnings.limitReachedMessage}
            variant="stable"
          />
        )}
        {!hasWarnings && <div className="h-7" />}
      </div>
    );
  }

  return (
    <>
      {warnings.showLimitWarning && !warnings.showLimitReached && (
        <ChatWarningBanner
          type="warning"
          message={warnings.limitWarningMessage}
          onDismiss={warnings.dismissWarning}
          variant="floating"
        />
      )}

      {warnings.showLimitReached && (
        <ChatWarningBanner
          type="error"
          message={warnings.limitReachedMessage}
          variant="floating"
        />
      )}
    </>
  );
}

import { ArchiveIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ArchivedBannerProps {
  isArchived?: boolean;
  hasApiKeys: boolean;
  onUnarchive: () => Promise<void>;
}

export function ArchivedBanner({
  isArchived,
  hasApiKeys,
  onUnarchive,
}: ArchivedBannerProps) {
  if (!(isArchived && hasApiKeys)) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-warning-border/30 bg-warning-bg p-2.5 sm:p-3">
      <ArchiveIcon className="size-5 flex-shrink-0 text-warning-foreground" />
      <span className="flex-1 text-sm text-warning-foreground">
        This conversation is archived. Restore it to continue chatting.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="flex-shrink-0 border-warning-border bg-transparent text-warning-foreground hover:bg-warning-bg"
        onClick={onUnarchive}
      >
        Restore Conversation
      </Button>
    </div>
  );
}

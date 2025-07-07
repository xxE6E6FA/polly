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
    <div className="relative px-3 pb-2 pt-1 sm:px-6 sm:pb-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-3 rounded-xl border-2 border-amber-200/30 bg-gradient-to-br from-amber-50/80 to-orange-50/30 p-2.5 dark:border-amber-800/20 dark:from-amber-950/30 dark:to-orange-950/10 sm:p-3">
          <ArchiveIcon className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-sm text-amber-800 dark:text-amber-200">
            This conversation is archived. Restore it to continue chatting.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 border-amber-600 bg-transparent text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-400 dark:hover:bg-amber-900/50"
            onClick={onUnarchive}
          >
            Restore Conversation
          </Button>
        </div>
      </div>
    </div>
  );
}

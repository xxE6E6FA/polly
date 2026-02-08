import {
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  TrashIcon,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MultiJobProgress, Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { BackgroundJob } from "@/hooks/use-background-jobs";
import { formatDate } from "@/lib/utils";

interface ActivitySectionProps {
  jobs: BackgroundJob[];
  onDownload: (jobId: string) => void;
  onRemove: (jobId: string) => void;
  isDownloading: boolean;
  downloadingJobId: string | null;
  showDetailed?: boolean;
  title?: string;
  description?: string;
  confirmDialog?: {
    isOpen: boolean;
    options: {
      title: string;
      description: string;
      confirmText?: string;
      cancelText?: string;
      variant?: "default" | "destructive";
    };
    confirm: (
      opts: {
        title: string;
        description: string;
        confirmText?: string;
        cancelText?: string;
        variant?: "default" | "destructive";
      },
      onConfirm: () => void,
      onCancel?: () => void
    ) => void;
    handleConfirm: () => void;
    handleCancel: () => void;
    handleOpenChange: (open: boolean) => void;
  };
}

function DetailedJobCard({
  job,
  onDownload,
  onRemove,
  isDownloading,
  downloadingJobId,
}: {
  job: BackgroundJob;
  onDownload: (jobId: string) => void;
  onRemove: (jobId: string) => void;
  isDownloading: boolean;
  downloadingJobId: string | null;
}) {
  const isActive = job.status === "processing" || job.status === "scheduled";
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  const isExport = job.type === "export";
  const isImport = job.type === "import";
  const isBulkDelete = job.type === "bulk_delete";

  const getStatusIcon = () => {
    if (isCompleted) {
      return <CheckCircleIcon className="size-5 text-success" />;
    }
    if (isFailed) {
      return <Warning className="size-5 text-danger" />;
    }
    if (isActive) {
      return <Spinner className="size-5 text-primary" />;
    }
    return <ClockIcon className="size-5 text-muted-foreground" />;
  };

  const getDescription = () => {
    if (isActive) {
      let action = "Processing";
      if (isExport) {
        action = "Exporting";
      } else if (isImport) {
        action = "Importing";
      } else if (isBulkDelete) {
        action = "Deleting";
      }

      return `${action} ${job.processed} of ${job.total} conversations...`;
    }

    if (isCompleted) {
      if (isExport && job.manifest) {
        return `Exported ${job.manifest.totalConversations} conversation${job.manifest.totalConversations === 1 ? "" : "s"}`;
      }
      if ((isImport || isBulkDelete) && job.result) {
        const processed = job.result.totalImported || 0;
        const total = job.result.totalProcessed || job.total;
        if (isBulkDelete) {
          return `Deleted ${processed} out of ${total} conversation${total === 1 ? "" : "s"}`;
        }
        return `Imported ${processed} out of ${total} conversation${total === 1 ? "" : "s"}`;
      }

      let action = "Processed";
      if (isExport) {
        action = "Exported";
      } else if (isImport) {
        action = "Imported";
      } else if (isBulkDelete) {
        action = "Deleted";
      }

      return `${action} ${job.total} conversation${job.total === 1 ? "" : "s"}`;
    }

    if (isFailed) {
      let action = "process";
      if (isExport) {
        action = "export";
      } else if (isImport) {
        action = "import";
      } else if (isBulkDelete) {
        action = "delete";
      }

      return `Failed to ${action} conversations`;
    }

    let action = "Operation";
    if (isExport) {
      action = "Export";
    } else if (isImport) {
      action = "Import";
    } else if (isBulkDelete) {
      action = "Deletion";
    }

    return `${action} scheduled`;
  };

  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">{getStatusIcon()}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {getDescription()}
            </p>
            {isCompleted && job.completedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Completed {formatDate(job.completedAt)}
              </p>
            )}
            {isActive && (
              <div className="mt-2">
                <Progress value={job.progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground mt-1">
                  {job.progress}% complete
                </p>
              </div>
            )}
            {isFailed && job.error && (
              <p className="text-xs text-danger mt-1">{job.error}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isCompleted && isExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(job.id)}
                disabled={isDownloading && downloadingJobId === job.id}
                className="h-8 w-8 p-0"
                title="Download export file"
                aria-label="Download export file"
              >
                {isDownloading && downloadingJobId === job.id ? (
                  <Spinner className="size-4" />
                ) : (
                  <DownloadIcon className="size-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(job.id)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-danger"
              title="Remove job from history"
              aria-label="Remove job from history"
            >
              <TrashIcon className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivitySection({
  jobs,
  onDownload,
  onRemove,
  isDownloading,
  downloadingJobId,
  showDetailed = false,
  title = "Recent Activity",
  description,
}: ActivitySectionProps) {
  if (jobs.length === 0) {
    return null;
  }

  const activeJobs = jobs.filter(
    job => job.status === "processing" || job.status === "scheduled"
  );

  return (
    <div className="stack-lg">
      <div className="flex items-center justify-between">
        <div>
          <h3
            className={
              showDetailed
                ? "text-lg font-semibold"
                : "text-sm font-medium text-muted-foreground"
            }
          >
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {!showDetailed && (
          <span className="text-xs text-muted-foreground">
            {activeJobs.length} active
          </span>
        )}
      </div>

      {showDetailed ? (
        <div className="stack-md">
          {jobs.map(job => (
            <DetailedJobCard
              key={job.id}
              job={job}
              onDownload={onDownload}
              onRemove={onRemove}
              isDownloading={isDownloading}
              downloadingJobId={downloadingJobId}
            />
          ))}
        </div>
      ) : (
        <MultiJobProgress
          jobs={jobs.map(job => ({
            id: job.id,
            type: job.type as
              | "export"
              | "import"
              | "bulk_archive"
              | "bulk_delete",
            status: job.status as
              | "scheduled"
              | "processing"
              | "completed"
              | "failed",
            progress: job.progress,
            processed: job.processed,
            total: job.total,
            error: job.error,
            title: job.title,
            description: job.description,
            includeAttachments: false,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          }))}
          onRemoveJob={onRemove}
          className="stack-sm"
        />
      )}
    </div>
  );
}

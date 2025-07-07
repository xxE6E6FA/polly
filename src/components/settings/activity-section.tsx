import {
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  TrashIcon,
  Warning,
} from "@phosphor-icons/react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MultiJobProgress, Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";

interface JobData {
  jobId: string;
  type: string;
  status: string;
  progress: number;
  processedItems: number;
  totalItems: number;
  error?: string;
  title?: string;
  description?: string;
  manifest?: {
    totalConversations: number;
    totalMessages: number;
  };
  result?: {
    totalImported?: number;
    totalProcessed?: number;
    errors?: string[];
  };
  hasFile?: boolean;
  createdAt: number;
  completedAt?: number;
}

interface ActivitySectionProps {
  jobs: JobData[];
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
  job: JobData;
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
      return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
    }
    if (isFailed) {
      return <Warning className="h-5 w-5 text-red-600" />;
    }
    if (isActive) {
      return <Spinner className="h-5 w-5 text-blue-600" />;
    }
    return <ClockIcon className="h-5 w-5 text-gray-500" />;
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

      return `${action} ${job.processedItems} of ${job.totalItems} conversations...`;
    }

    if (isCompleted) {
      if (isExport && job.manifest) {
        return `Exported ${job.manifest.totalConversations} conversation${job.manifest.totalConversations === 1 ? "" : "s"}`;
      }
      if ((isImport || isBulkDelete) && job.result) {
        const processed = job.result.totalImported || 0;
        const total = job.result.totalProcessed || job.totalItems;
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

      return `${action} ${job.totalItems} conversation${job.totalItems === 1 ? "" : "s"}`;
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
              </div>
            )}
            {isFailed && job.error && (
              <p className="text-xs text-red-600 mt-1">{job.error}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isCompleted && isExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(job.jobId)}
                disabled={isDownloading && downloadingJobId === job.jobId}
                className="h-8 w-8 p-0"
              >
                {isDownloading && downloadingJobId === job.jobId ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(job.jobId)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
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
    <div className="space-y-4">
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
        <div className="space-y-3">
          {jobs.map(job => (
            <DetailedJobCard
              key={job.jobId}
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
            id: job.jobId,
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
            processed: job.processedItems,
            total: job.totalItems,
            error: job.error,
            title: job.title,
            description: job.description,
            includeAttachments: false,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          }))}
          onRemoveJob={onRemove}
          className="space-y-2"
        />
      )}
    </div>
  );
}

import {
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  TrashIcon,
  UploadIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import type { BackgroundJob } from "@/hooks/use-background-jobs";
import { cn } from "@/lib/utils";

type ProgressProps = {
  value?: number;
  className?: string;
  variant?: "default" | "success" | "error" | "warning";
} & React.HTMLAttributes<HTMLDivElement>;

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, variant = "default", ...props }, ref) => {
    const getProgressColor = () => {
      switch (variant) {
        case "success":
          return "bg-gradient-to-r from-green-500 to-green-600 shadow-sm shadow-green-500/20";
        case "error":
          return "bg-gradient-to-r from-red-500 to-red-600 shadow-sm shadow-red-500/20";
        case "warning":
          return "bg-gradient-to-r from-yellow-500 to-yellow-600 shadow-sm shadow-yellow-500/20";
        default:
          return "bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 shadow-sm shadow-blue-500/20";
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            getProgressColor()
          )}
          style={{
            width: `${Math.min(100, Math.max(0, value))}%`,
          }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

interface JobProgressCardProps {
  job: BackgroundJob;
  onRemove?: (jobId: string) => void;
}

const JobProgressCard = React.forwardRef<HTMLDivElement, JobProgressCardProps>(
  ({ job, onRemove }, ref) => {
    const getStatusIcon = () => {
      switch (job.status) {
        case "scheduled":
          return <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />;
        case "processing":
          return <Spinner className="h-3.5 w-3.5 text-blue-500" />;
        case "completed":
          return <CheckCircleIcon className="h-3.5 w-3.5 text-green-500" />;
        case "failed":
          return <XCircleIcon className="h-3.5 w-3.5 text-red-500" />;
        default:
          return <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />;
      }
    };

    const getTypeIcon = () => {
      if (job.type === "export") {
        return <DownloadIcon className="h-3.5 w-3.5" />;
      }
      if (job.type === "import") {
        return <UploadIcon className="h-3.5 w-3.5" />;
      }
      if (job.type === "bulk_delete") {
        return <TrashIcon className="h-3.5 w-3.5" />;
      }
      return <UploadIcon className="h-3.5 w-3.5" />;
    };

    const getStatusText = () => {
      switch (job.status) {
        case "scheduled":
          return "Queued";
        case "processing":
          return "In progress";
        case "completed":
          return "Complete";
        case "failed":
          return "Failed";
        default:
          return "Unknown";
      }
    };

    const getActivityText = () => {
      let action = "Processing";
      if (job.type === "export") {
        action = "Exporting";
      } else if (job.type === "import") {
        action = "Importing";
      } else if (job.type === "bulk_delete") {
        action = "Deleting";
      }

      const itemText = job.total === 1 ? "conversation" : "conversations";
      return `${action} ${job.total} ${itemText}`;
    };

    const getProgressVariant = ():
      | "default"
      | "success"
      | "error"
      | "warning" => {
      switch (job.status) {
        case "completed":
          return "success";
        case "failed":
          return "error";
        case "scheduled":
          return "warning";
        default:
          return "default";
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "group relative rounded-lg border bg-card px-3 py-2.5 transition-all duration-200",
          "hover:shadow-sm",
          job.status === "completed" &&
            "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20",
          job.status === "failed" &&
            "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20",
          job.status === "processing" &&
            "border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {getTypeIcon()}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {getActivityText()}
                </span>
                <div className="flex items-center gap-1">
                  {getStatusIcon()}
                  <span className="text-xs text-muted-foreground">
                    {getStatusText()}
                  </span>
                </div>
              </div>
              {job.status === "processing" && (
                <div className="flex items-center gap-2 mt-1">
                  <Progress
                    value={job.progress}
                    variant={getProgressVariant()}
                    className="h-1.5 flex-1"
                  />
                  <span className="text-xs font-mono text-muted-foreground">
                    {Math.round(job.progress)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {onRemove &&
            (job.status === "completed" || job.status === "failed") && (
              <button
                onClick={() => onRemove(job.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded ml-2"
                title="Dismiss"
              >
                <XIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
        </div>

        {job.error && (
          <div className="mt-2 p-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <div className="text-xs text-red-600 dark:text-red-400">
              <strong>Error:</strong> {job.error}
            </div>
          </div>
        )}
      </div>
    );
  }
);
JobProgressCard.displayName = "JobProgressCard";

interface MultiJobProgressProps {
  jobs: BackgroundJob[];
  onRemoveJob?: (jobId: string) => void;
  className?: string;
}

const MultiJobProgress = React.forwardRef<
  HTMLDivElement,
  MultiJobProgressProps
>(({ jobs, onRemoveJob, className }, ref) => {
  if (jobs.length === 0) {
    return null;
  }

  return (
    <div ref={ref} className={cn("stack-sm", className)}>
      {jobs.map(job => (
        <JobProgressCard key={job.id} job={job} onRemove={onRemoveJob} />
      ))}
    </div>
  );
});
MultiJobProgress.displayName = "MultiJobProgress";

export { Progress, JobProgressCard, MultiJobProgress };
export type { BackgroundJob, JobProgressCardProps, MultiJobProgressProps };

import * as React from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DownloadIcon,
  UploadIcon,
  XIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/spinner";
import { type BackgroundJob } from "@/hooks/use-background-jobs";

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
          "relative h-2 w-full overflow-hidden rounded-full bg-secondary/50",
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
          return <ClockIcon className="h-4 w-4 text-muted-foreground" />;
        case "processing":
          return <Spinner className="h-4 w-4 text-blue-500" />;
        case "completed":
          return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
        case "failed":
          return <XCircleIcon className="h-4 w-4 text-red-500" />;
        default:
          return <ClockIcon className="h-4 w-4 text-muted-foreground" />;
      }
    };

    const getTypeIcon = () => {
      return job.type === "export" ? (
        <DownloadIcon className="h-4 w-4" />
      ) : (
        <UploadIcon className="h-4 w-4" />
      );
    };

    const getStatusText = () => {
      switch (job.status) {
        case "scheduled":
          return "Queued";
        case "processing":
          return "Processing...";
        case "completed":
          return "Completed";
        case "failed":
          return "Failed";
        default:
          return "Unknown";
      }
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
          "group relative rounded-lg border bg-card p-4 transition-all duration-200",
          "hover:shadow-md hover:shadow-primary/5",
          job.status === "completed" &&
            "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20",
          job.status === "failed" &&
            "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20",
          job.status === "processing" &&
            "border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {getTypeIcon()}
              <span className="font-medium capitalize">{job.type} Job</span>
            </div>
            <div className="flex items-center gap-1.5">
              {getStatusIcon()}
              <span className="text-sm text-muted-foreground">
                {getStatusText()}
              </span>
            </div>
          </div>

          {onRemove &&
            (job.status === "completed" || job.status === "failed") && (
              <button
                onClick={() => onRemove(job.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                title="Remove job"
              >
                <XIcon className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">
              {job.processed} of {job.total} items
            </span>
            <span className="font-mono text-sm font-medium">
              {Math.round(job.progress)}%
            </span>
          </div>

          <Progress
            value={job.progress}
            variant={getProgressVariant()}
            className="h-2"
          />
        </div>

        {job.error && (
          <div className="mt-3 p-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <div className="text-sm text-red-600 dark:text-red-400">
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
  if (jobs.length === 0) return null;

  return (
    <div ref={ref} className={cn("space-y-3", className)}>
      {jobs.map(job => (
        <JobProgressCard key={job.id} job={job} onRemove={onRemoveJob} />
      ))}
    </div>
  );
});
MultiJobProgress.displayName = "MultiJobProgress";

export { Progress, JobProgressCard, MultiJobProgress };
export type { BackgroundJob, JobProgressCardProps, MultiJobProgressProps };

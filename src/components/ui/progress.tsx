import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import {
  BrainIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  TrashIcon,
  UploadIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import type { BackgroundJob } from "@/hooks/use-background-jobs";
import { cn } from "@/lib/utils";

type ProgressProps = {
  value?: number;
  className?: string;
  variant?: "default" | "success" | "error" | "warning";
  ref?: React.Ref<HTMLDivElement>;
};

const progressColorMap = {
  success:
    "bg-gradient-to-r from-success to-success-hover shadow-sm shadow-success/20",
  error:
    "bg-gradient-to-r from-danger to-danger-hover shadow-sm shadow-danger/20",
  warning:
    "bg-gradient-to-r from-warning to-warning-hover shadow-sm shadow-warning/20",
  default:
    "bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 shadow-sm shadow-blue-500/20",
} as const;

function Progress({
  className,
  value = 0,
  variant = "default",
  ref,
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
        className
      )}
    >
      <ProgressPrimitive.Track>
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            progressColorMap[variant]
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

type JobProgressCardProps = {
  job: BackgroundJob;
  onRemove?: (jobId: string) => void;
  ref?: React.Ref<HTMLDivElement>;
};

function JobProgressCard({ job, onRemove, ref }: JobProgressCardProps) {
  const getStatusIcon = () => {
    switch (job.status) {
      case "scheduled":
        return <ClockIcon className="size-3.5 text-muted-foreground" />;
      case "processing":
        return <Spinner className="size-3.5 text-info" />;
      case "completed":
        return <CheckCircleIcon className="size-3.5 text-success" />;
      case "failed":
        return <XCircleIcon className="size-3.5 text-danger" />;
      default:
        return <ClockIcon className="size-3.5 text-muted-foreground" />;
    }
  };

  const getTypeIcon = () => {
    if (job.type === "export") {
      return <DownloadIcon className="size-3.5" />;
    }
    if (job.type === "import") {
      return <UploadIcon className="size-3.5" />;
    }
    if (job.type === "bulk_delete") {
      return <TrashIcon className="size-3.5" />;
    }
    if (job.type === "memory_scan") {
      return <BrainIcon className="size-3.5" />;
    }
    return <UploadIcon className="size-3.5" />;
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
    } else if (job.type === "memory_scan") {
      action = "Scanning";
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
          "border-success-border bg-success-bg/50 dark:border-success-border dark:bg-success-bg/20",
        job.status === "failed" &&
          "border-danger-border bg-danger-bg/50 dark:border-danger-border dark:bg-danger-bg/20",
        job.status === "processing" &&
          "border-info-border bg-info-bg/30 dark:border-info-border dark:bg-info-bg/10"
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
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
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
              <XIcon className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
      </div>

      {job.error && (
        <div className="mt-2 p-2 rounded-md bg-danger-bg dark:bg-danger-bg/20 border border-danger-border dark:border-danger-border">
          <div className="text-xs text-danger">
            <strong>Error:</strong> {job.error}
          </div>
        </div>
      )}
    </div>
  );
}

type MultiJobProgressProps = {
  jobs: BackgroundJob[];
  onRemoveJob?: (jobId: string) => void;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

function MultiJobProgress({
  jobs,
  onRemoveJob,
  className,
  ref,
}: MultiJobProgressProps) {
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
}

export { Progress, JobProgressCard, MultiJobProgress };
export type { BackgroundJob, JobProgressCardProps, MultiJobProgressProps };

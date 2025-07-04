import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "convex/_generated/api";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useConfirmationDialog } from "../../hooks/use-confirmation-dialog";
import {
  TrashIcon,
  FileTextIcon,
  UploadIcon,
  WarningIcon,
  DownloadIcon,
} from "@phosphor-icons/react";

// Update type to match the API response exactly
interface JobData {
  jobId: string;
  type:
    | "export"
    | "import"
    | "bulk_archive"
    | "bulk_delete"
    | "conversation_summary"
    | "data_migration"
    | "model_migration"
    | "backup";
  category:
    | "data_transfer"
    | "bulk_operations"
    | "ai_processing"
    | "maintenance";
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  processedItems: number;
  totalItems: number;
  error?: string;
  title?: string;
  description?: string;
  priority: "low" | "normal" | "high" | "urgent";
  includeAttachments?: boolean;
  manifest?: {
    totalConversations: number;
    totalMessages: number;
    conversationDateRange: {
      earliest: number;
      latest: number;
    };
    conversationTitles: string[];
    includeAttachments: boolean;
    fileSizeBytes?: number;
    version: string;
  };
  hasFile?: boolean;
  result?: {
    totalImported: number;
    totalProcessed: number;
    errors: string[];
  };
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface JobItemProps {
  job: JobData;
  onDownload: (jobId: string) => void;
  onRemove: (jobId: string) => void;
  isDownloading: boolean;
}

function JobItem({ job, onDownload, onRemove, isDownloading }: JobItemProps) {
  const isActive = job.status === "processing" || job.status === "scheduled";
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  const isExport = job.type === "export";
  const isImport = job.type === "import";

  // Generate a short ID for display
  const shortId = job.jobId.slice(0, 8);

  const getStatusBadge = () => {
    switch (job.status) {
      case "scheduled":
        return <Badge variant="secondary">Scheduled</Badge>;
      case "processing":
        return <Badge variant="default">Processing</Badge>;
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{job.status}</Badge>;
    }
  };

  const getJobIcon = () => {
    return isExport ? (
      <FileTextIcon className="w-4 h-4 text-blue-500" />
    ) : (
      <UploadIcon className="w-4 h-4 text-green-500" />
    );
  };

  const getJobTitle = () => {
    if (job.title) return job.title;
    return `${isExport ? "Export" : "Import"} ${shortId}`;
  };

  const getJobDescription = () => {
    if (job.description) return job.description;

    // Generate description based on manifest/result
    if (isExport && job.manifest) {
      return `${job.manifest.totalConversations} conversations, ${job.manifest.totalMessages} messages`;
    } else if (isImport && job.result) {
      return `${job.result.totalImported || 0}/${job.result.totalProcessed || job.totalItems} imported`;
    } else if (isActive) {
      return `${job.processedItems}/${job.totalItems} processed (${job.progress}%)`;
    } else {
      return `${job.totalItems} conversations`;
    }
  };

  const shouldShowProgress = isActive && job.totalItems > 0;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getJobIcon()}
            <div>
              <CardTitle className="text-base">{getJobTitle()}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {getJobDescription()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <span className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {shouldShowProgress && (
          <div className="mb-4">
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="text-muted-foreground">
                {job.processedItems} of {job.totalItems} items
              </span>
              <span className="font-mono text-sm font-medium">
                {Math.round(job.progress)}%
              </span>
            </div>
            <Progress value={job.progress} className="h-2" />
          </div>
        )}

        {isFailed && job.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <WarningIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Error</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{job.error}</p>
          </div>
        )}

        {/* Show import errors if any */}
        {isImport && job.result?.errors && job.result.errors.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-amber-700">
              <WarningIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Import Warnings</span>
            </div>
            <div className="text-sm text-amber-600 mt-1">
              {job.result.errors.slice(0, 3).map((error, index) => (
                <p key={index}>{error}</p>
              ))}
              {job.result.errors.length > 3 && (
                <p>... and {job.result.errors.length - 3} more</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          {isExport && isCompleted && job.hasFile && (
            <Button
              size="sm"
              onClick={() => onDownload(job.jobId)}
              disabled={isDownloading}
              className="flex items-center gap-2"
            >
              <DownloadIcon className="w-4 h-4" />
              {isDownloading ? "Downloading..." : "Download"}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => onRemove(job.jobId)}
            className="flex items-center gap-2"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExportHistory() {
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const confirmDialog = useConfirmationDialog();

  const deleteJob = useMutation(api.backgroundJobs.deleteJob);

  const allJobs = useQuery(api.backgroundJobs.listUserJobs, {
    limit: 20,
  });

  const downloadUrlData = useQuery(
    api.backgroundJobs.getExportDownloadUrl,
    downloadingJobId ? { jobId: downloadingJobId } : "skip"
  );

  const { activeJobs, completedJobs } = useMemo(() => {
    if (!allJobs) return { activeJobs: [], completedJobs: [] };

    const active = allJobs
      .filter(job => job.status === "processing" || job.status === "scheduled")
      .sort((a, b) => b.createdAt - a.createdAt);

    const completed = allJobs
      .filter(job => job.status === "completed" || job.status === "failed")
      .sort(
        (a, b) =>
          (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt)
      );

    return { activeJobs: active, completedJobs: completed };
  }, [allJobs]);

  const triggerDownload = useCallback(
    async (downloadUrl: string, jobId: string) => {
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `polly-export-${jobId.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast.success("Export file downloaded successfully");
      } catch (error) {
        console.error("Download failed:", error);
        toast.error("Failed to download export file");
      } finally {
        setDownloadingJobId(null);
      }
    },
    []
  );

  React.useEffect(() => {
    if (downloadUrlData?.downloadUrl && downloadingJobId) {
      triggerDownload(downloadUrlData.downloadUrl, downloadingJobId);
    }
  }, [downloadUrlData?.downloadUrl, downloadingJobId, triggerDownload]);

  const handleDownloadExport = useCallback((jobId: string) => {
    setDownloadingJobId(jobId);
  }, []);

  const handleRemoveJob = useCallback(
    (jobId: string) => {
      const job = allJobs?.find(j => j.jobId === jobId);
      const displayName =
        job?.title ||
        `${job?.type === "export" ? "Export" : "Import"} ${jobId.slice(0, 8)}`;
      const jobType = job?.type === "export" ? "export" : "import";

      confirmDialog.confirm(
        {
          title: `Delete ${jobType.charAt(0).toUpperCase() + jobType.slice(1)}`,
          description: `Are you sure you want to delete "${displayName}"? This action cannot be undone${jobType === "export" ? " and the export file will be permanently removed" : ""}.`,
          confirmText: "Delete",
          cancelText: "Cancel",
          variant: "destructive",
        },
        () => {
          (async () => {
            try {
              await deleteJob({ jobId });
              toast.success(
                `${jobType.charAt(0).toUpperCase() + jobType.slice(1)} deleted successfully`
              );
            } catch (error) {
              console.error(`Failed to delete ${jobType}:`, error);
              toast.error(`Failed to delete ${jobType}`, {
                description:
                  error instanceof Error
                    ? error.message
                    : "Unknown error occurred",
              });
            }
          })();
        }
      );
    },
    [deleteJob, confirmDialog, allJobs]
  );

  if (!allJobs || (activeJobs.length === 0 && completedJobs.length === 0)) {
    return null;
  }

  const allDisplayJobs = [...activeJobs, ...completedJobs];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Background Jobs</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Track your import and export operations. Files are automatically
          deleted after 30 days.
        </p>
      </div>

      <div className="space-y-4">
        {allDisplayJobs.map(job => (
          <JobItem
            key={job.jobId}
            job={job}
            onDownload={handleDownloadExport}
            onRemove={handleRemoveJob}
            isDownloading={downloadingJobId === job.jobId}
          />
        ))}
      </div>
    </div>
  );
}

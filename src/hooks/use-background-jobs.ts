import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  downloadFromUrl,
  generateBackgroundExportFilename,
} from "@/lib/export";
import type { ParsedConversation } from "@/lib/import-parsers";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";

export type JobType =
  | "export"
  | "import"
  | "bulk_archive"
  | "bulk_delete"
  | "conversation_summary"
  | "data_migration"
  | "model_migration"
  | "backup";

export interface BackgroundJob {
  id: string;
  type: JobType;
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  processed: number;
  total: number;
  error?: string;
  title?: string;
  description?: string;
  includeAttachments?: boolean;
  manifest?: {
    totalConversations: number;
    totalMessages: number;
    totalAttachments?: number;
    attachmentTypes?: Record<string, number>;
    totalAttachmentSizeBytes?: number;
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
    conversationIds?: string[];
  };
  createdAt: number;
  completedAt?: number;
}

export function useBackgroundJobs(options: { suppressToasts?: boolean } = {}) {
  const [localJobs, setLocalJobs] = useState<Map<string, BackgroundJob>>(
    new Map()
  );
  const { suppressToasts = false } = options;
  const managedToast = useToast();
  const toastRef = useRef(managedToast);
  toastRef.current = managedToast;
  const convex = useConvex();
  const convexRef = useRef(convex);
  convexRef.current = convex;

  const jobStatuses = useQuery(api.backgroundJobs.listUserJobs, { limit: 100 });

  const scheduleBackgroundExport = useAction(
    api.conversationExport.scheduleBackgroundExport
  );
  const scheduleBackgroundImport = useAction(
    api.conversations.scheduleBackgroundImport
  );
  const scheduleBackgroundBulkDelete = useAction(
    api.conversations.scheduleBackgroundBulkDelete
  );

  const deleteJobMutation = useMutation(api.backgroundJobs.deleteJob);

  const previousJobStatuses = useRef<typeof jobStatuses>(null);

  const activeJobs = useMemo(() => {
    if (!(jobStatuses && Array.isArray(jobStatuses))) {
      return new Map<string, BackgroundJob>();
    }

    const transformedJobs = new Map<string, BackgroundJob>();

    jobStatuses.forEach((job: Doc<"backgroundJobs">) => {
      const transformedJob: BackgroundJob = {
        id: job.jobId || job._id,
        type: job.type as JobType,
        status: job.status,
        progress:
          job.processedItems && job.totalItems
            ? Math.round((job.processedItems / job.totalItems) * 100)
            : 0,
        processed: job.processedItems || 0,
        total: job.totalItems || 0,
        error: job.error,
        title: job.title,
        description: job.description,
        includeAttachments: job.includeAttachments,
        manifest: job.manifest,
        hasFile:
          job.type === "export" &&
          job.status === "completed" &&
          Boolean(job.fileStorageId),
        result: job.result,
        createdAt: job._creationTime,
        completedAt: job.completedAt,
      };

      transformedJobs.set(transformedJob.id, transformedJob);
    });

    // Merge with local jobs
    localJobs.forEach((localJob: BackgroundJob) => {
      if (!transformedJobs.has(localJob.id)) {
        transformedJobs.set(localJob.id, localJob);
      }
    });

    return transformedJobs;
  }, [jobStatuses, localJobs]);

  useEffect(() => {
    if (
      !(
        jobStatuses &&
        Array.isArray(jobStatuses) &&
        previousJobStatuses.current &&
        Array.isArray(previousJobStatuses.current)
      )
    ) {
      previousJobStatuses.current = jobStatuses;
      return;
    }

    const previousMap = new Map(
      previousJobStatuses.current.map((job: Doc<"backgroundJobs">) => [
        job._id,
        job,
      ])
    );

    jobStatuses.forEach((job: Doc<"backgroundJobs">) => {
      const previousJob = previousMap.get(job._id);
      if (previousJob && previousJob.status !== job.status) {
        if (job.status === "completed") {
          const jobKey = job.jobId || job._id;

          let message = "";
          let action: { label: string; onClick: () => void } | undefined;

          if (job.type === "export") {
            message = "Export completed successfully!";
            action = {
              label: "Download",
              onClick: () => {
                void (async () => {
                  const loadingToastId = toastRef.current.loading(
                    "Preparing download...",
                    {
                      id: `loading-download-${jobKey}`,
                    }
                  );

                  try {
                    const downloadData = await convexRef.current.query(
                      api.backgroundJobs.getExportDownloadUrl,
                      { jobId: jobKey }
                    );

                    if (downloadData?.downloadUrl) {
                      const manifest = (() => {
                        if (downloadData.manifest) {
                          return {
                            totalConversations:
                              downloadData.manifest.totalConversations,
                            includeAttachments:
                              downloadData.manifest.includeAttachments,
                          };
                        }
                        if (job.manifest) {
                          return {
                            totalConversations: job.manifest.totalConversations,
                            includeAttachments: job.manifest.includeAttachments,
                          };
                        }
                        return undefined;
                      })();

                      const filename =
                        generateBackgroundExportFilename(manifest);
                      await downloadFromUrl(downloadData.downloadUrl, filename);

                      toastRef.current.success("Download started", {
                        description: `Export file downloaded as ${filename}`,
                        id: `download-${jobKey}`,
                      });
                    } else {
                      toastRef.current.error("Download failed", {
                        description:
                          "Export file is not available for download",
                        id: `download-error-${jobKey}`,
                      });
                    }
                  } catch (error) {
                    toastRef.current.error("Download failed", {
                      description:
                        error instanceof Error
                          ? error.message
                          : "An error occurred while downloading the file",
                      id: `download-error-${jobKey}`,
                    });
                  } finally {
                    toastRef.current.dismiss(loadingToastId);
                  }
                })();
              },
            };
          } else if (job.type === "import") {
            message = "Import completed successfully!";
            // Invalidate conversations cache to reflect imported conversations
            del(CACHE_KEYS.conversations);
          } else if (job.type === "bulk_delete") {
            message = "Bulk delete completed successfully!";
            // Invalidate conversations cache to reflect deleted conversations
            del(CACHE_KEYS.conversations);
          }

          if (message && !suppressToasts) {
            toastRef.current.success(message, {
              id: `job-${jobKey}`,
              action,
            });
          }
        } else if (job.status === "failed") {
          const jobKey = job.jobId || job._id;

          let message = "";
          if (job.type === "export") {
            message = `Export failed: ${job.error}`;
          } else if (job.type === "import") {
            message = `Import failed: ${job.error}`;
          } else if (job.type === "bulk_delete") {
            message = `Bulk delete failed: ${job.error}`;
          }

          if (message && !suppressToasts) {
            toastRef.current.error(message, { id: `job-error-${jobKey}` });
          }
        }
      }
    });

    previousJobStatuses.current = jobStatuses;
  }, [jobStatuses, suppressToasts]);

  const startExport = async (
    conversationIds: Id<"conversations">[],
    options: { includeAttachmentContent?: boolean } = {}
  ) => {
    const jobId = crypto.randomUUID();

    try {
      await scheduleBackgroundExport({
        conversationIds,
        includeAttachmentContent: options.includeAttachmentContent,
        jobId: jobId,
      });

      const newJob: BackgroundJob = {
        id: jobId,
        type: "export",
        status: "scheduled",
        progress: 0,
        processed: 0,
        total: conversationIds.length,
        includeAttachments: options.includeAttachmentContent,
        createdAt: Date.now(),
      };

      setLocalJobs(prev => new Map(prev).set(jobId, newJob));
      managedToast.success(
        "Export started in background. You'll be notified when it's ready.",
        { id: `start-export-${jobId}` }
      );

      return jobId;
    } catch (error) {
      managedToast.error("Failed to start export");
      throw error;
    }
  };

  const startImport = async (
    conversations: ParsedConversation[],
    options: { title?: string; description?: string } = {}
  ) => {
    const jobId = crypto.randomUUID();

    try {
      await scheduleBackgroundImport({
        conversations,
        importId: jobId,
        ...options,
      });

      const newJob: BackgroundJob = {
        id: jobId,
        type: "import",
        status: "scheduled",
        progress: 0,
        processed: 0,
        total: conversations.length,
        title: options.title,
        description: options.description,
        createdAt: Date.now(),
      };

      setLocalJobs(prev => new Map(prev).set(jobId, newJob));
      managedToast.success(
        "Import started in background. You'll be notified when it's ready.",
        { id: `start-import-${jobId}` }
      );

      return jobId;
    } catch (error) {
      managedToast.error("Failed to start import");
      throw error;
    }
  };

  const startBulkDelete = async (conversationIds: Id<"conversations">[]) => {
    const jobId = crypto.randomUUID();

    try {
      await scheduleBackgroundBulkDelete({
        conversationIds,
        jobId,
      });

      const newJob: BackgroundJob = {
        id: jobId,
        type: "bulk_delete",
        status: "scheduled",
        progress: 0,
        processed: 0,
        total: conversationIds.length,
        title: `Delete ${conversationIds.length} Conversations`,
        description: `Background deletion of ${
          conversationIds.length
        } conversation${conversationIds.length !== 1 ? "s" : ""}`,
        createdAt: Date.now(),
      };

      setLocalJobs(prev => new Map(prev).set(jobId, newJob));
      managedToast.success(
        "Bulk delete started in background. You'll be notified when it's complete.",
        { id: `start-bulk-delete-${jobId}` }
      );

      return jobId;
    } catch (error) {
      managedToast.error("Failed to start bulk delete");
      throw error;
    }
  };

  const getJob = (jobId: string): BackgroundJob | undefined => {
    return activeJobs.get(jobId);
  };

  const removeJob = async (jobId: string) => {
    try {
      await deleteJobMutation({ jobId });

      // Also remove from local state
      setLocalJobs(prev => {
        const newMap = new Map(prev);
        newMap.delete(jobId);
        return newMap;
      });

      managedToast.success("Job removed successfully");
    } catch (_error) {
      managedToast.error("Failed to remove job");
    }
  };

  const getActiveJobs = () => {
    return Array.from(activeJobs.values()).filter(
      job => job.status === "scheduled" || job.status === "processing"
    );
  };

  const getCompletedJobs = () => {
    return Array.from(activeJobs.values()).filter(
      job => job.status === "completed" || job.status === "failed"
    );
  };

  return {
    startExport,
    startImport,
    startBulkDelete,
    getJob,
    removeJob,
    getActiveJobs,
    getCompletedJobs,
    activeJobs: Array.from(activeJobs.values()),
  };
}

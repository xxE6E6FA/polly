import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";

export function useBackgroundExportExample() {
  // Get list of recent jobs
  const listJobs = useQuery(api.backgroundJobs.listUserJobs, { limit: 10 });

  // Create export job
  const createExport = useAction(api.conversations.scheduleBackgroundExport);

  const startExport = async (conversationIds: Id<"conversations">[]) => {
    const jobId = `export-${Date.now()}`;
    const result = await createExport({
      jobId,
      conversationIds,
      includeAttachmentContent: true,
    });
    return { jobId: result.jobId, status: result.status };
  };

  return {
    listJobs,
    startExport,
  };
}

export function useBackgroundJobPolling(jobId: string) {
  // Poll job status
  const jobStatus = useQuery(
    api.backgroundJobs.getStatus,
    jobId ? { jobId } : "skip"
  );

  // Get job result when complete
  const jobResult = useQuery(
    api.backgroundJobs.getResult,
    jobId && jobStatus?.status === "completed" ? { jobId } : "skip"
  );

  return {
    status: jobStatus?.status,
    progress: jobStatus?.progress,
    error: jobStatus?.error,
    result: jobResult,
    isComplete: jobStatus?.status === "completed",
    isFailed: jobStatus?.status === "failed",
  };
}

export function useBackgroundImportExample() {
  // Create import job
  const createImport = useAction(api.conversations.scheduleBackgroundImport);

  const startImport = async (
    conversations: unknown[],
    title?: string,
    description?: string
  ) => {
    const importId = `import-${Date.now()}`;
    const result = await createImport({
      conversations,
      importId,
      title,
      description,
    });
    return { importId: result.importId, status: result.status };
  };

  return {
    startImport,
  };
}

export function useBackgroundJobManagement() {
  // Clean up old jobs
  const cleanupJobs = useMutation(api.backgroundJobs.cleanupOldJobs);

  const cleanupOldJobs = async (olderThanDays = 30) => {
    const result = await cleanupJobs({ olderThanDays });
    return result;
  };

  return {
    cleanupOldJobs,
  };
}

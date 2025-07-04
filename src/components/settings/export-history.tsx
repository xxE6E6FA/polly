import { ActivitySection } from "./activity-section";
import { useJobManagement } from "@/hooks/use-job-management";

export function ExportHistory() {
  const jobManagement = useJobManagement({ limit: 20 });

  return (
    <ActivitySection
      jobs={jobManagement.allJobs}
      onDownload={jobManagement.handleDownload}
      onRemove={jobManagement.handleRemoveJob}
      isDownloading={jobManagement.isDownloading}
      downloadingJobId={jobManagement.downloadingJobId}
      showDetailed={true}
      title="Background Jobs"
      description="Track your import and export operations. Files are automatically deleted after 30 days."
      confirmDialog={jobManagement.confirmDialog}
    />
  );
}

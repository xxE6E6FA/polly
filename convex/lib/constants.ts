// Shared constants for background jobs

export const JOB_TYPES = [
  "export",
  "import", 
  "bulk_archive",
  "bulk_delete",
  "conversation_summary",
  "data_migration",
  "model_migration",
  "backup"
] as const;

export const JOB_STATUSES = [
  "scheduled",
  "processing", 
  "completed",
  "failed",
  "cancelled"
] as const;

export const JOB_CATEGORIES = [
  "data_transfer",
  "bulk_operations", 
  "ai_processing",
  "maintenance"
] as const;

export const JOB_PRIORITIES = [
  "low",
  "normal",
  "high", 
  "urgent"
] as const;

export type JobType = typeof JOB_TYPES[number];
export type JobStatus = typeof JOB_STATUSES[number];
export type JobCategory = typeof JOB_CATEGORIES[number];
export type JobPriority = typeof JOB_PRIORITIES[number]; 
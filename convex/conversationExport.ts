import { v } from "convex/values";
import { action } from "./_generated/server";
import {
  hydrateExportDataWithAttachments,
  processBackgroundExportHandler,
  scheduleBackgroundExportHandler,
} from "./lib/conversation_export/handlers";

// Re-export handler functions for tests
export { hydrateExportDataWithAttachments, scheduleBackgroundExportHandler };

export const scheduleBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    jobId: v.string(),
  },
  handler: scheduleBackgroundExportHandler,
});

export const processBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    jobId: v.string(),
    includeAttachments: v.boolean(),
    userId: v.id("users"),
  },
  handler: processBackgroundExportHandler,
});

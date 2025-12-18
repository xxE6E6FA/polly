import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run auto-archive for all users daily at 2 AM UTC
crons.daily(
  "auto-archive conversations",
  { hourUTC: 2, minuteUTC: 0 },
  internal.cleanup.archiveConversationsForAllUsers,
  { batchSize: 50 }
);

// Reset monthly user stats daily at 3 AM UTC
crons.daily(
  "reset monthly user stats",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.resetMonthlyUserStats,
  { batchSize: 100 }
);

// Clean up orphaned messages weekly on Sunday at 3 AM UTC
crons.weekly(
  "cleanup orphaned messages",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.cleanupOrphanedMessages,
  { batchSize: 100, daysOld: 7 }
);

// Clean up old background jobs monthly on the 2nd at 4 AM UTC
crons.monthly(
  "cleanup old background jobs",
  { day: 2, hourUTC: 4, minuteUTC: 0 },
  internal.backgroundJobs.cleanupOldJobsForAllUsers,
  { olderThanDays: 30 }
);

// Clean up old shared conversations weekly on Sunday at 4 AM UTC
crons.weekly(
  "cleanup old shared conversations",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.cleanup.cleanupOldSharedConversations,
  { batchSize: 100, daysOld: 90 }
);

// Clean up expired PDF text cache daily at 5 AM UTC
crons.daily(
  "cleanup expired PDF cache",
  { hourUTC: 5, minuteUTC: 0 },
  internal.ai.pdf_cache.batchCleanupExpired
);

// Sync models.dev capability cache daily at 6 AM UTC
crons.daily(
  "sync models.dev cache",
  { hourUTC: 6, minuteUTC: 0 },
  internal.models_dev_sync.syncModelsDevCache,
  {}
);

export default crons;

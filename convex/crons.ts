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

// Clean up orphaned messages weekly on Sunday at 3 AM UTC
crons.weekly(
  "cleanup orphaned messages",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.cleanupOrphanedMessages,
  { batchSize: 100, daysOld: 7 }
);

// Clean up old shared conversations monthly on the 1st at 4 AM UTC
crons.monthly(
  "cleanup old shared conversations",
  { day: 1, hourUTC: 4, minuteUTC: 0 },
  internal.cleanup.cleanupOldSharedConversations,
  { daysOld: 90, batchSize: 100 }
);

// Clean up old background jobs monthly on the 2nd at 4 AM UTC
crons.monthly(
  "cleanup old background jobs",
  { day: 2, hourUTC: 4, minuteUTC: 0 },
  internal.backgroundJobs.cleanupOldJobsForAllUsers,
  { olderThanDays: 30 }
);

export default crons;

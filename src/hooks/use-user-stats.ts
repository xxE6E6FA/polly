import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { useAuthenticatedUserId } from "./use-authenticated-user-id";

export const useUserStats = () => {
  const userId = useAuthenticatedUserId();
  const stats = useQuery(api.users.getUserStats, userId ? { userId } : "skip");
  const initializeCounters = useMutation(api.users.initializeUserStatsCounters);

  useEffect(() => {
    if (stats?.needsCounterInitialization && userId) {
      initializeCounters({
        userId,
        conversationCount: stats.conversationCount,
        totalMessageCount: stats.totalMessages,
      });
    }
  }, [
    stats?.needsCounterInitialization,
    userId,
    stats?.conversationCount,
    stats?.totalMessages,
    initializeCounters,
  ]);

  return stats;
};

import { useUserDataContext } from "@/providers/user-data-context";

/**
 * Hook to get message sent counts.
 * Reads directly from user document via context to avoid separate query.
 */
export function useMessageSentCount() {
  const { user } = useUserDataContext();

  return {
    messagesSent: user?.messagesSent ?? 0,
    monthlyMessagesSent: user?.monthlyMessagesSent ?? 0,
  };
}

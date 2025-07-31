import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

export function useMessageSentCount() {
  const data = useQuery(api.users.getMessageSentCount);

  return {
    messagesSent: data?.messagesSent ?? 0,
    monthlyMessagesSent: data?.monthlyMessagesSent ?? 0,
  };
}

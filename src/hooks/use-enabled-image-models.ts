import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";

export function useEnabledImageModels() {
  const { user } = useUserDataContext();
  const enabledImageModels = useQuery(
    api.imageModels.getUserImageModels,
    user?._id ? {} : "skip"
  );
  return Array.isArray(enabledImageModels) ? enabledImageModels : undefined;
}

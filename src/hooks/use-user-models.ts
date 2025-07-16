import { api } from "@convex/_generated/api";
import { usePersistentConvexQuery } from "./use-persistent-convex-query";

export function useUserModels() {
  const userModelsByProvider = usePersistentConvexQuery(
    "user-models-by-provider",
    api.userModels.getUserModelsByProvider,
    {}
  );
  const hasUserModels = usePersistentConvexQuery(
    "has-user-models",
    api.userModels.hasUserModels,
    {}
  );

  return {
    userModelsByProvider,
    hasUserModels,
    isLoading: false,
  };
}

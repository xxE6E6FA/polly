import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useOptimisticUpdate } from "./use-optimistic-updates";
import { useQueryUserId } from "./use-query-user-id";

const generateTempId = (prefix: string): string => {
  return `temp-${prefix}-${Math.random()
    .toString(36)
    .substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
};

export function useOptimisticModelToggle() {
  const userId = useQueryUserId();

  return useOptimisticUpdate<
    Doc<"userModels">[],
    { modelId: string; modelData?: Record<string, unknown> }
  >({
    convexMutation: api.userModels.toggleModel,
    queryKey: "userModels",
    optimisticUpdate: (variables, currentData) => {
      if (!Array.isArray(currentData)) {
        return currentData;
      }

      const existingModel = currentData.find(
        model => model.modelId === variables.modelId
      );

      if (existingModel) {
        return currentData.filter(model => model.modelId !== variables.modelId);
      }
      if (variables.modelData && userId) {
        const newModel: Doc<"userModels"> = {
          _id: generateTempId("usermodel") as Id<"userModels">,
          _creationTime: Date.now(),
          userId,
          modelId: variables.modelData.modelId as string,
          name: variables.modelData.name as string,
          provider: variables.modelData.provider as string,
          contextLength: variables.modelData.contextLength as number,
          maxOutputTokens: variables.modelData.maxOutputTokens as
            | number
            | undefined,
          supportsImages: variables.modelData.supportsImages as boolean,
          supportsTools: variables.modelData.supportsTools as boolean,
          supportsReasoning: variables.modelData.supportsReasoning as boolean,
          inputModalities: variables.modelData.inputModalities as
            | string[]
            | undefined,
          selected: false,
          free: variables.modelData.free as boolean | undefined,
          createdAt: Date.now(),
        };

        return [...currentData, newModel];
      }

      return currentData;
    },
    invalidateQueries: ["userModels", "userModelsByProvider"],
  });
}

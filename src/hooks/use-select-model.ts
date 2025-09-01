import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { CACHE_KEYS, set } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

export function useSelectModel() {
  const selectModelMutation = useMutation(api.userModels.selectModel);
  const managedToast = useToast();

  const selectModel = useCallback(
    async (modelId: string, provider: string, catalog?: AvailableModel[]) => {
      if (Array.isArray(catalog)) {
        const model = catalog.find(
          m => m?.modelId === modelId && m?.provider === provider
        );
        if (model) {
          set(CACHE_KEYS.selectedModel, model);
        }
      }
      try {
        await selectModelMutation({ modelId, provider });
      } catch (_err) {
        managedToast.error("Failed to select model", {
          description: "Unable to change the selected model. Please try again.",
        });
      }
    },
    [selectModelMutation, managedToast.error]
  );

  return { selectModel };
}

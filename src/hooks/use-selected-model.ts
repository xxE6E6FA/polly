import { api } from "@convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";
import { useChatInputStore } from "@/stores/chat-input-store";
import type { HydratedModel } from "@/types";

export function useSelectedModel() {
  const { isAuthenticated } = useConvexAuth();

  // Skip until auth is ready so the pre-auth default model doesn't
  // overwrite the user's cached selection with a flash of wrong model.
  const selectedModelFromServer = useQuery(
    api.userModels.getUserSelectedModel,
    isAuthenticated ? {} : "skip"
  );
  const selectModelMutation = useMutation(api.userModels.selectModel);
  const selectedModel = useChatInputStore(
    s => s.selectedModel
  ) as HydratedModel | null;
  const setSelectedModel = useChatInputStore(s => s.setSelectedModel) as (
    m: HydratedModel | null
  ) => void;
  const managedToast = useToast();

  // Initialize from cache immediately for instant display
  useEffect(() => {
    if (selectedModel == null) {
      const cached = get<HydratedModel | null>(CACHE_KEYS.selectedModel, null);
      if (cached) {
        setSelectedModel(cached);
      }
    }
  }, [selectedModel, setSelectedModel]);

  // Update store and cache when server data arrives
  useEffect(() => {
    if (
      selectedModelFromServer !== undefined &&
      selectedModelFromServer !== null
    ) {
      setSelectedModel(selectedModelFromServer);
      set(CACHE_KEYS.selectedModel, selectedModelFromServer);
    }
  }, [selectedModelFromServer, setSelectedModel]);

  const selectModel = useCallback(
    async (modelId: string, provider: string, catalog?: HydratedModel[]) => {
      // Optimistic update from catalog
      if (catalog) {
        const model = catalog.find(
          m => m?.modelId === modelId && m?.provider === provider
        );
        if (model) {
          setSelectedModel(model);
          set(CACHE_KEYS.selectedModel, model);
        }
      }
      try {
        await selectModelMutation({ modelId, provider });
      } catch {
        managedToast.error("Failed to select model", {
          description: "Unable to change the selected model. Please try again.",
        });
      }
    },
    [selectModelMutation, setSelectedModel, managedToast]
  );

  return { selectedModel, selectModel };
}

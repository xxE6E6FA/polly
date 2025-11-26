import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { useChatInputStore } from "@/stores/chat-input-store";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

export function useSelectedModel() {
  const selectedModelFromServer = useQuery(
    api.userModels.getUserSelectedModel,
    {}
  );
  const selectedModel = useChatInputStore(
    s => s.selectedModel
  ) as AvailableModel | null;
  const setSelectedModel = useChatInputStore(s => s.setSelectedModel) as (
    m: AvailableModel | null
  ) => void;

  // Initialize from cache immediately for instant display
  useEffect(() => {
    if (selectedModel == null) {
      const cached = get<AvailableModel | null>(CACHE_KEYS.selectedModel, null);
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
      // Cache for instant display on next visit
      set(CACHE_KEYS.selectedModel, selectedModelFromServer);
    }
  }, [selectedModelFromServer, setSelectedModel]);

  return [selectedModel, setSelectedModel] as const;
}

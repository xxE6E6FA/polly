import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { CACHE_KEYS, get } from "@/lib/local-storage";
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

  // Hydrate from server or local cache
  useEffect(() => {
    if (
      selectedModelFromServer !== undefined &&
      selectedModelFromServer !== null
    ) {
      setSelectedModel(selectedModelFromServer);
      return;
    }
    if (selectedModel == null) {
      const cached = get(
        CACHE_KEYS.selectedModel,
        null
      ) as AvailableModel | null;
      if (cached) {
        setSelectedModel(cached);
      }
    }
  }, [selectedModelFromServer, selectedModel, setSelectedModel]);

  return [selectedModel, setSelectedModel] as const;
}

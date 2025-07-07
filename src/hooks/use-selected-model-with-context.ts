import { useMemo } from "react";
import type { AIModel } from "@/types";
import { useSelectedModel } from "./use-selected-model";

export function useSelectedModelWithContext() {
  const { selectedModel, ...rest } = useSelectedModel();

  const currentModel = useMemo(() => {
    if (!selectedModel) {
      return undefined;
    }
    return {
      ...selectedModel,
      contextLength: selectedModel.contextLength,
      _id: selectedModel._id,
      _creationTime: selectedModel._creationTime,
      userId: selectedModel.userId,
    } as AIModel;
  }, [selectedModel]);

  return {
    selectedModel,
    currentModel,
    ...rest,
  };
}

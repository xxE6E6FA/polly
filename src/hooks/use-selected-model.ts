import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  getCachedSelectedModel,
  setCachedSelectedModel,
  clearUserCache,
} from "../lib/user-cache";
import { Doc } from "../../convex/_generated/dataModel";

export function useSelectedModel() {
  // Initialize with cached data for instant rendering
  const [cachedModel] = useState<Doc<"userModels"> | null>(() => {
    if (typeof window === "undefined") return null;
    return getCachedSelectedModel();
  });

  // Query the selected model
  const selectedModel = useQuery(api.userModels.getUserSelectedModel);

  // Update cache when model changes
  useEffect(() => {
    if (selectedModel !== undefined) {
      setCachedSelectedModel(selectedModel);
    }
  }, [selectedModel]);

  // Clear cache on logout (listen for the same event as user hook)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleGraduationComplete = () => {
      clearUserCache(); // This clears both user and model cache
    };

    window.addEventListener("user-graduated", handleGraduationComplete);
    return () => {
      window.removeEventListener("user-graduated", handleGraduationComplete);
    };
  }, []);

  // Return cached model while loading
  return selectedModel ?? cachedModel;
}

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";

/**
 * Centralized hook for archiving/unarchiving canvas generations and upscale entries.
 *
 * Does NOT include toasts — callers handle their own UX (countdown toast + undo).
 */
export function useArchiveGeneration() {
  const archiveMutation = useMutation(api.generations.archiveGeneration);
  const unarchiveMutation = useMutation(api.generations.unarchiveGeneration);
  const archiveUpscaleMutation = useMutation(
    api.generations.archiveUpscaleEntry
  );
  const unarchiveUpscaleMutation = useMutation(
    api.generations.unarchiveUpscaleEntry
  );

  const archiveGeneration = useCallback(
    (id: Id<"generations">) => archiveMutation({ id }),
    [archiveMutation]
  );

  const unarchiveGeneration = useCallback(
    (id: Id<"generations">) => unarchiveMutation({ id }),
    [unarchiveMutation]
  );

  const archiveUpscaleEntry = useCallback(
    (id: Id<"generations">, upscaleId: string) =>
      archiveUpscaleMutation({ id, upscaleId }),
    [archiveUpscaleMutation]
  );

  const unarchiveUpscaleEntry = useCallback(
    (id: Id<"generations">, upscaleId: string) =>
      unarchiveUpscaleMutation({ id, upscaleId }),
    [unarchiveUpscaleMutation]
  );

  return {
    archiveGeneration,
    unarchiveGeneration,
    archiveUpscaleEntry,
    unarchiveUpscaleEntry,
  };
}

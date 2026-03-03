import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { useDiscoveryStore } from "@/stores/discovery-store";

/**
 * Bridge between Zustand discovery store and Convex DB.
 * Provides fire-and-forget methods for persisting session state.
 */
export function useDiscoverySessionSync() {
  const createSession = useMutation(api.discoverySessions.create);
  const recordReaction = useMutation(api.discoverySessions.recordReaction);
  const pauseSession = useMutation(api.discoverySessions.pause);

  const persistNewSession = useCallback(
    async (opts: {
      sessionId: string;
      modelId: string;
      aspectRatio: string;
      seedPrompt?: string;
      seedImageStorageId?: Id<"_storage">;
      personaId?: Id<"personas">;
    }) => {
      const dbId = await createSession({
        sessionId: opts.sessionId,
        modelId: opts.modelId,
        aspectRatio: opts.aspectRatio,
        seedPrompt: opts.seedPrompt,
        seedImageStorageId: opts.seedImageStorageId,
        personaId: opts.personaId,
      });
      useDiscoveryStore.setState({ dbSessionId: dbId });
      return dbId;
    },
    [createSession]
  );

  const syncReaction = useCallback(
    (
      sessionId: string,
      generationId: Id<"generations">,
      prompt: string,
      reaction: "liked" | "disliked" | "saved"
    ) => {
      recordReaction({ sessionId, generationId, prompt, reaction });
    },
    [recordReaction]
  );

  const syncPause = useCallback(
    (sessionId: string) => {
      pauseSession({ sessionId });
    },
    [pauseSession]
  );

  return { persistNewSession, syncReaction, syncPause };
}

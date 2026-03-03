import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { DiscoveryMode } from "@/components/canvas/discovery-mode";
import { Spinner } from "@/components/ui/spinner";
import { ROUTES } from "@/lib/routes";
import { useDiscoveryStore } from "@/stores/discovery-store";

export default function DiscoverySessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const storeSessionId = useDiscoveryStore(s => s.sessionId);
  const isActive = useDiscoveryStore(s => s.isActive);
  const resumeDiscovery = useDiscoveryStore(s => s.resume);

  const needsHydration = !isActive || storeSessionId !== sessionId;

  const sessionData = useQuery(
    api.discoverySessions.getWithHistory,
    needsHydration && sessionId ? { sessionId } : "skip"
  );

  useEffect(() => {
    if (!(sessionData && needsHydration)) {
      return;
    }

    const { session, entries } = sessionData;
    resumeDiscovery({
      sessionId: session.sessionId,
      dbSessionId: session._id,
      modelId: session.modelId,
      personaId: session.personaId ?? undefined,
      aspectRatio: session.aspectRatio,
      seedPrompt: session.seedPrompt ?? undefined,
      seedImageStorageId: session.seedImageStorageId ?? undefined,
      history: entries,
      likedPrompts: session.likedPrompts,
      dislikedPrompts: session.dislikedPrompts,
    });
  }, [sessionData, needsHydration, resumeDiscovery]);

  if (!sessionId) {
    return <Navigate to={ROUTES.DISCOVER} replace />;
  }

  if (!isActive || storeSessionId !== sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return <DiscoveryMode />;
}

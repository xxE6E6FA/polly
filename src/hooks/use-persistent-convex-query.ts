import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { get as getLS, set as setLS } from "@/lib/local-storage";

function getSnapshot<T>(key: string): T | undefined {
  return getLS<T | undefined>(`cache/${key}/v1`, undefined);
}

function saveSnapshot(key: string, value: unknown): void {
  setLS(`cache/${key}/v1`, value);
}

function createCacheKey(identifier: string, args: unknown): string {
  if (args === "skip") {
    return `${identifier}-skip`;
  }

  try {
    // Stable stringify for consistent cache keys
    const argsStr =
      typeof args === "object" && args !== null
        ? JSON.stringify(
            args,
            Object.keys(args as Record<string, unknown>).sort()
          )
        : JSON.stringify(args);
    // Compute a compact, deterministic hash without relying on deprecated APIs
    let hash = 0;
    for (let i = 0; i < argsStr.length; i++) {
      hash = (hash << 5) - hash + argsStr.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    const safeHash = Math.abs(hash).toString(36); // base-36 for shorter representation
    return `${identifier}-${safeHash}`;
  } catch {
    // Fallback for unstringifiable args
    return `${identifier}-${Date.now()}`;
  }
}

export function usePersistentConvexQuery<T = unknown>(
  identifier: string,
  query: FunctionReference<"query">,
  args: Record<string, unknown> | "skip"
): T | undefined {
  const cacheKey = args === "skip" ? null : createCacheKey(identifier, args);

  // SSR safety: only read snapshot on client and when not skipping
  const initial = cacheKey ? getSnapshot<T>(cacheKey) : undefined;

  const [value, setValue] = useState<T | undefined>(initial);
  const live = useQuery(query, args);
  const prevLive = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (live !== undefined && live !== prevLive.current) {
      setValue(live);

      // Only save to cache if we have a valid cache key (not skipping)
      if (cacheKey) {
        saveSnapshot(cacheKey, live);
      }

      prevLive.current = live;
    }
  }, [live, cacheKey]);

  // Return undefined immediately if skipping (after all hooks are called)
  if (args === "skip") {
    return undefined;
  }

  return value;
}

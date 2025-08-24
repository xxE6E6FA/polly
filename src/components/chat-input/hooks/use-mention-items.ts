import type { Id } from "@convex/_generated/dataModel";
import { useMemo, useRef } from "react";
import { useDebouncedValue } from "./use-debounced-value";

interface UseMentionItemsOptions {
  personas: Array<{
    _id: Id<"personas">;
    name: string;
    icon?: string;
  }>;
  mentionQuery: string;
}

type MentionItem = {
  id: Id<"personas"> | null;
  name: string;
  icon?: string;
};

// Simple LRU cache for mention search results
class MentionCache {
  private cache = new Map<string, MentionItem[]>();
  private maxSize = 50; // Keep last 50 search results

  get(key: string): MentionItem[] | undefined {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: MentionItem[]): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

export function useMentionItems({
  personas,
  mentionQuery,
}: UseMentionItemsOptions) {
  // Debounce the search query to avoid excessive filtering
  const debouncedQuery = useDebouncedValue(mentionQuery, 150);

  // Cache for search results
  const cacheRef = useRef(new MentionCache());

  // Clear cache when personas list changes (different conversation or persona updates)
  const personasHashRef = useRef<string>("");
  const personasHash = useMemo(() => {
    return personas.map(p => `${p._id}:${p.name}`).join("|");
  }, [personas]);

  if (personasHashRef.current !== personasHash) {
    cacheRef.current.clear();
    personasHashRef.current = personasHash;
  }

  const mentionItems = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const cacheKey = `${personasHash}:${q}`;

    // Check cache first
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    let result: MentionItem[];

    if (q) {
      // Enhanced search - check both name start and contains
      const startsWithMatches = personas.filter(p =>
        p.name.toLowerCase().startsWith(q)
      );
      const containsMatches = personas.filter(
        p =>
          !p.name.toLowerCase().startsWith(q) &&
          p.name.toLowerCase().includes(q)
      );

      const filtered = [...startsWithMatches, ...containsMatches];
      result = [
        { id: null, name: "Default", icon: "🤖" },
        ...filtered.map(p => ({ id: p._id, name: p.name, icon: p.icon })),
      ];
    } else {
      result = [
        { id: null, name: "Default", icon: "🤖" },
        ...personas.map(p => ({ id: p._id, name: p.name, icon: p.icon })),
      ];
    }

    // Cache the result
    cacheRef.current.set(cacheKey, result);
    return result;
  }, [debouncedQuery, personas, personasHash]);

  const currentPersona = useMemo(() => {
    // This will be handled at the component level using selectedPersonaId
    return null;
  }, []);

  return {
    mentionItems,
    currentPersona,
  };
}

import { createContext, useContext, useMemo } from "react";
import type { WebSearchCitation } from "@/types";

type CitationContextType = {
  citations: WebSearchCitation[];
  messageId?: string;
};

const CitationContext = createContext<CitationContextType | null>(null);

export function CitationProvider({
  children,
  citations,
  messageId,
}: {
  children: React.ReactNode;
  citations: WebSearchCitation[];
  messageId?: string;
}) {
  const value = useMemo(
    () => ({ citations, messageId }),
    [citations, messageId]
  );

  return (
    <CitationContext.Provider value={value}>
      {children}
    </CitationContext.Provider>
  );
}

export function useCitations() {
  const context = useContext(CitationContext);
  if (!context) {
    return { citations: [], messageId: undefined };
  }
  return context;
}

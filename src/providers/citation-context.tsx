import { createContext, useContext } from "react";
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
  return (
    <CitationContext.Provider value={{ citations, messageId }}>
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

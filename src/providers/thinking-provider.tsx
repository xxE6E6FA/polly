import type React from "react";
import { createContext, useContext, useState } from "react";

type ThinkingContextType = {
  isThinking: boolean;
  setIsThinking: (thinking: boolean) => void;
};

const ThinkingContext = createContext<ThinkingContextType | undefined>(
  undefined
);

export const ThinkingProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isThinking, setIsThinking] = useState(false);

  const value = { isThinking, setIsThinking };

  return (
    <ThinkingContext.Provider value={value}>
      {children}
    </ThinkingContext.Provider>
  );
};

export function useThinking() {
  const context = useContext(ThinkingContext);
  if (context === undefined) {
    throw new Error("useThinking must be used within a ThinkingProvider");
  }
  return context;
}

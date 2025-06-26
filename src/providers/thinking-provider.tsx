import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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

  const memoizedSetIsThinking = useCallback((thinking: boolean) => {
    setIsThinking(thinking);
  }, []);

  const value = useMemo(
    () => ({ isThinking, setIsThinking: memoizedSetIsThinking }),
    [isThinking, memoizedSetIsThinking]
  );

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

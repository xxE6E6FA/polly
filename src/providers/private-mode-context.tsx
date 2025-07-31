import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface PrivateModeContextType {
  isPrivateMode: boolean;
  togglePrivateMode: () => void;
  setPrivateMode: (value: boolean) => void;
}

const PrivateModeContext = createContext<PrivateModeContextType | undefined>(
  undefined
);

export function PrivateModeProvider({ children }: { children: ReactNode }) {
  const [isPrivateMode, setIsPrivateMode] = useState(false);

  const togglePrivateMode = useCallback(() => {
    setIsPrivateMode(prev => !prev);
  }, []);

  const setPrivateMode = useCallback((value: boolean) => {
    setIsPrivateMode(value);
  }, []);

  const value = useMemo(
    () => ({
      isPrivateMode,
      togglePrivateMode,
      setPrivateMode,
    }),
    [isPrivateMode, togglePrivateMode, setPrivateMode]
  );

  return (
    <PrivateModeContext.Provider value={value}>
      {children}
    </PrivateModeContext.Provider>
  );
}

export function usePrivateMode() {
  const context = useContext(PrivateModeContext);
  if (context === undefined) {
    throw new Error("usePrivateMode must be used within a PrivateModeProvider");
  }
  return context;
}

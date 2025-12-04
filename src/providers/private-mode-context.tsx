import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { clearApiKeyCache } from "@/lib/ai/private-api-keys";
import { CACHE_KEYS, del, setPrivateModeChecker } from "@/lib/local-storage";

interface PrivateModeContextType {
  isPrivateMode: boolean;
  togglePrivateMode: () => void;
  setPrivateMode: (value: boolean) => void;
}

const PrivateModeContext = createContext<PrivateModeContextType | undefined>(
  undefined
);

// Global flag to check private mode status from non-React code
// Used by localStorage utilities to skip writes in private mode
let globalPrivateModeEnabled = false;

/**
 * Check if private mode is currently enabled
 * Can be called from non-React code (e.g., localStorage utilities)
 */
export function isPrivateModeEnabled(): boolean {
  return globalPrivateModeEnabled;
}

/**
 * Sensitive cache keys that should be cleared when entering private mode
 */
const SENSITIVE_CACHE_KEYS = [
  CACHE_KEYS.conversations,
  CACHE_KEYS.userData,
  CACHE_KEYS.apiKeys,
  CACHE_KEYS.userModels,
  CACHE_KEYS.selectedModel,
  CACHE_KEYS.recentModels,
] as const;

/**
 * Clear all sensitive data caches when entering private mode
 */
function clearSensitiveData(): void {
  // Clear API key in-memory cache
  clearApiKeyCache();

  // Clear sensitive localStorage keys
  for (const key of SENSITIVE_CACHE_KEYS) {
    del(key);
  }
}

export function PrivateModeProvider({ children }: { children: ReactNode }) {
  const [isPrivateMode, setIsPrivateMode] = useState(false);

  // Wire up the private mode checker for localStorage on mount
  useEffect(() => {
    setPrivateModeChecker(isPrivateModeEnabled);
  }, []);

  // Update global flag when state changes
  useEffect(() => {
    globalPrivateModeEnabled = isPrivateMode;
  }, [isPrivateMode]);

  // Clear sensitive data when entering private mode
  useEffect(() => {
    if (isPrivateMode) {
      clearSensitiveData();
    }
  }, [isPrivateMode]);

  const togglePrivateMode = useCallback(() => {
    setIsPrivateMode(prev => {
      const newValue = !prev;
      // Clear data when enabling private mode
      if (newValue) {
        clearSensitiveData();
      }
      return newValue;
    });
  }, []);

  const setPrivateMode = useCallback((value: boolean) => {
    // Clear data when enabling private mode
    if (value) {
      clearSensitiveData();
    }
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

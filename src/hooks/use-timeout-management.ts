import { useCallback, useEffect, useRef } from "react";

export interface TimeoutOptions {
  onTimeout?: () => void;
  autoCleanup?: boolean;
}

export function useTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearExistingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const setTimeoutWithCleanup = useCallback(
    (callback: () => void, delay: number, options: TimeoutOptions = {}) => {
      const { onTimeout, autoCleanup = true } = options;

      // Clear any existing timeout
      clearExistingTimeout();

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callback();
        onTimeout?.();

        if (autoCleanup) {
          timeoutRef.current = null;
        }
      }, delay);

      return timeoutRef.current;
    },
    [clearExistingTimeout]
  );

  const isActive = useCallback(() => {
    return timeoutRef.current !== null;
  }, []);

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      clearExistingTimeout();
    };
  }, [clearExistingTimeout]);

  return {
    setTimeout: setTimeoutWithCleanup,
    clearTimeout: clearExistingTimeout,
    isActive,
  };
}

// Specialized timeout hook for debouncing
export function useDebounceTimeout() {
  const { setTimeout, clearTimeout, isActive } = useTimeout();

  const debounce = useCallback(
    (callback: () => void, delay: number) => {
      return setTimeout(callback, delay);
    },
    [setTimeout]
  );

  return {
    debounce,
    clearDebounce: clearTimeout,
    isDebouncing: isActive,
  };
}

// Specialized timeout hook for optimistic updates
export function useOptimisticTimeout() {
  const { setTimeout, clearTimeout, isActive } = useTimeout();

  const setOptimisticTimeout = useCallback(
    (fallbackCallback: () => void, duration: number) => {
      return setTimeout(fallbackCallback, duration, {
        onTimeout: () => {
          console.warn(
            "Optimistic update timed out, falling back to server state"
          );
        },
      });
    },
    [setTimeout]
  );

  return {
    setOptimisticTimeout,
    clearOptimisticTimeout: clearTimeout,
    hasOptimisticTimeout: isActive,
  };
}

// Hook for managing multiple timeouts
export function useMultipleTimeouts() {
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const setNamedTimeout = useCallback(
    (name: string, callback: () => void, delay: number) => {
      // Clear existing timeout with this name
      const existing = timeoutsRef.current.get(name);
      if (existing) {
        clearTimeout(existing);
      }

      // Set new timeout
      const timeoutId = setTimeout(() => {
        callback();
        timeoutsRef.current.delete(name);
      }, delay);

      timeoutsRef.current.set(name, timeoutId);
      return timeoutId;
    },
    []
  );

  const clearNamedTimeout = useCallback((name: string) => {
    const timeoutId = timeoutsRef.current.get(name);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutsRef.current.delete(name);
    }
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    timeoutsRef.current.clear();
  }, []);

  const hasTimeout = useCallback((name: string) => {
    return timeoutsRef.current.has(name);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

  return {
    setNamedTimeout,
    clearNamedTimeout,
    clearAllTimeouts,
    hasTimeout,
    activeTimeouts: () => Array.from(timeoutsRef.current.keys()),
  };
}

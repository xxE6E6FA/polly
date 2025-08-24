import { useMemo } from "react";

/**
 * Creates a hash-based change detection for props to optimize React.memo
 * This is more efficient than checking individual properties
 */
export function usePropsHash(props: Record<string, unknown>): string {
  return useMemo(() => {
    const keys = Object.keys(props).sort();
    let hash = "";

    for (const key of keys) {
      const value = props[key];

      if (typeof value === "function") {
        // For functions, use reference identity (assume they're stable)
        hash += `${key}:${value.name || "fn"}|`;
      } else if (typeof value === "object" && value !== null) {
        // For objects, create a shallow hash
        if (Array.isArray(value)) {
          hash += `${key}:[${value.length}]|`;
        } else {
          const objKeys = Object.keys(value).sort();
          hash += `${key}:{${objKeys.join(",")}}|`;
        }
      } else {
        // For primitives, use the value directly
        hash += `${key}:${value}|`;
      }
    }

    return hash;
  }, [props]);
}

/**
 * Optimized memo comparison using hash-based detection
 */
export function createHashMemoComparison<T extends Record<string, unknown>>(
  excludeKeys: string[] = []
) {
  return (prevProps: T, nextProps: T): boolean => {
    // Quick reference check first
    if (prevProps === nextProps) {
      return true;
    }

    // Filter out excluded keys
    const filteredPrevProps = Object.fromEntries(
      Object.entries(prevProps).filter(([key]) => !excludeKeys.includes(key))
    );
    const filteredNextProps = Object.fromEntries(
      Object.entries(nextProps).filter(([key]) => !excludeKeys.includes(key))
    );

    // Check if keys are different
    const prevKeys = Object.keys(filteredPrevProps);
    const nextKeys = Object.keys(filteredNextProps);

    if (prevKeys.length !== nextKeys.length) {
      return false;
    }

    // Hash-based comparison for performance
    let prevHash = "";
    let nextHash = "";

    for (const key of prevKeys.sort()) {
      const prevValue = filteredPrevProps[key];
      const nextValue = filteredNextProps[key];

      // Fast path for same references
      if (prevValue === nextValue) {
        prevHash += `${key}:same|`;
        nextHash += `${key}:same|`;
        continue;
      }

      // Type-specific hashing
      if (typeof prevValue === "function" && typeof nextValue === "function") {
        // Assume stable function references
        prevHash += `${key}:${prevValue.name || "fn"}|`;
        nextHash += `${key}:${nextValue.name || "fn"}|`;
      } else if (
        typeof prevValue === "object" &&
        typeof nextValue === "object"
      ) {
        if (prevValue === null || nextValue === null) {
          prevHash += `${key}:${prevValue}|`;
          nextHash += `${key}:${nextValue}|`;
        } else if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
          prevHash += `${key}:[${prevValue.length}]|`;
          nextHash += `${key}:[${nextValue.length}]|`;
        } else {
          // Object comparison - just check key structure for performance
          const prevObjKeys = Object.keys(prevValue).sort().join(",");
          const nextObjKeys = Object.keys(nextValue).sort().join(",");
          prevHash += `${key}:{${prevObjKeys}}|`;
          nextHash += `${key}:{${nextObjKeys}}|`;
        }
      } else {
        prevHash += `${key}:${prevValue}|`;
        nextHash += `${key}:${nextValue}|`;
      }
    }

    return prevHash === nextHash;
  };
}

import { v } from "convex/values";

// Standardized pagination arguments schema
export const paginationOptsSchema = v.optional(
  v.object({
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
    id: v.optional(v.number()), // Handle Convex's internal id field
  })
);

// Default pagination settings (can be overridden)
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Configuration object for pagination settings
export interface PaginationConfig {
  defaultPageSize?: number;
  maxPageSize?: number;
}

// Global configuration with defaults
let globalPaginationConfig: Required<PaginationConfig> = {
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
};

// Function to configure global pagination settings
export function configurePagination(config: PaginationConfig) {
  globalPaginationConfig = {
    defaultPageSize: config.defaultPageSize ?? DEFAULT_PAGE_SIZE,
    maxPageSize: config.maxPageSize ?? MAX_PAGE_SIZE,
  };
}

// Function to get current pagination configuration
export function getPaginationConfig(): Required<PaginationConfig> {
  return { ...globalPaginationConfig };
}

// Helper function to ensure pagination options are within bounds
export function validatePaginationOpts(
  opts?: {
    numItems: number;
    cursor: string | null;
    id?: number; // Handle Convex's internal id field
  },
  config?: PaginationConfig
) {
  if (!opts) return undefined;

  const effectiveConfig = config
    ? {
        defaultPageSize:
          config.defaultPageSize ?? globalPaginationConfig.defaultPageSize,
        maxPageSize: config.maxPageSize ?? globalPaginationConfig.maxPageSize,
      }
    : globalPaginationConfig;

  let validatedNumItems = effectiveConfig.defaultPageSize;

  if (
    typeof opts.numItems === "number" &&
    !isNaN(opts.numItems) &&
    isFinite(opts.numItems) &&
    opts.numItems > 0
  ) {
    validatedNumItems = Math.floor(opts.numItems);
    validatedNumItems = Math.min(
      Math.max(1, validatedNumItems),
      effectiveConfig.maxPageSize
    );
  }

  return {
    numItems: validatedNumItems,
    cursor: opts.cursor,
    ...(opts.id !== undefined && { id: opts.id }), // Preserve id if present
  };
}

// Overloaded function for per-call configuration
export function validatePaginationOptsWithConfig(
  opts?: {
    numItems: number;
    cursor: string | null;
    id?: number; // Handle Convex's internal id field
  },
  defaultPageSize?: number,
  maxPageSize?: number
) {
  return validatePaginationOpts(opts, {
    defaultPageSize,
    maxPageSize,
  });
}

// Helper to create empty pagination result for early returns
export function createEmptyPaginationResult<T>() {
  return {
    page: [] as T[],
    isDone: true,
    continueCursor: null,
  };
}

import { v } from "convex/values";

// Standardized pagination arguments schema
export const paginationOptsSchema = v.optional(
  v.object({
    numItems: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    id: v.optional(v.number()), // Handle Convex's internal id field
  })
);

// Default pagination settings
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Helper function to ensure pagination options are within bounds
export function validatePaginationOpts(
  opts?: {
    numItems?: number;
    cursor?: string | null;
    id?: number; // Handle Convex's internal id field
  },
) {
  if (!opts) return undefined;

  let validatedNumItems = DEFAULT_PAGE_SIZE;

  if (
    typeof opts.numItems === "number" &&
    !isNaN(opts.numItems) &&
    isFinite(opts.numItems) &&
    opts.numItems > 0
  ) {
    validatedNumItems = Math.floor(opts.numItems);
    validatedNumItems = Math.min(
      Math.max(1, validatedNumItems),
      MAX_PAGE_SIZE
    );
  }

  return {
    numItems: validatedNumItems,
    cursor: opts.cursor ?? null,
    ...(opts.id !== undefined && { id: opts.id }), // Preserve id if present
  };
}

// Helper to create empty pagination result for early returns
export function createEmptyPaginationResult<T>() {
  return {
    page: [] as T[],
    isDone: true,
    continueCursor: null,
  };
}

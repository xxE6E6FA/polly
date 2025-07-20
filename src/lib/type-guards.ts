import type { Doc } from "@convex/_generated/dataModel";

/*
 * Type Guard Guidelines
 *
 * DO NOT create guards that simply check for `_id` and `_creationTime` properties
 * when the data comes from trusted Convex queries. These guards are unnecessary
 * and should be replaced with proper Convex Doc<"..."> types.
 *
 * Guards should only be used for:
 * - Untrusted external data (localStorage, cookies, file uploads, user input)
 * - Complex validation logic beyond basic property existence
 * - Data from unsafe sources that don't guarantee type safety
 */

// Generic helper for validating arrays with a validator function
function isValidArray<T>(
  x: unknown,
  validator: (item: unknown) => item is T
): x is T[] {
  return Array.isArray(x) && x.every(validator);
}

// User type guard
export function isUser(x: unknown): x is Doc<"users"> {
  return (
    !!x &&
    typeof x === "object" &&
    "_id" in x &&
    "_creationTime" in x &&
    typeof (x as Record<string, unknown>)._id === "string" &&
    typeof (x as Record<string, unknown>)._creationTime === "number"
  );
}

// Frequently used type guards - keep as specific functions
export function isUserSettings(x: unknown): x is {
  userId: string;
  personasEnabled: boolean;
  openRouterSorting: "default" | "price" | "throughput" | "latency";
  anonymizeForDemo: boolean;
  autoArchiveEnabled: boolean;
  autoArchiveDays: number;
} {
  return (
    !!x &&
    typeof x === "object" &&
    "userId" in x &&
    typeof (x as Record<string, unknown>).userId === "string" &&
    "personasEnabled" in x &&
    "autoArchiveEnabled" in x &&
    "autoArchiveDays" in x
  );
}

export function isPersona(x: unknown): x is Doc<"personas"> {
  return (
    !!x &&
    typeof x === "object" &&
    "_id" in x &&
    "name" in x &&
    typeof (x as Record<string, unknown>).name === "string"
  );
}

export function isUserApiKey(x: unknown): x is { provider: string } {
  return (
    !!x &&
    typeof x === "object" &&
    "provider" in x &&
    typeof (x as Record<string, unknown>).provider === "string"
  );
}

export function isUserModel(x: unknown): x is Doc<"userModels"> {
  return (
    !!x &&
    typeof x === "object" &&
    "_id" in x &&
    "modelId" in x &&
    "provider" in x &&
    typeof (x as Record<string, unknown>).modelId === "string" &&
    typeof (x as Record<string, unknown>).provider === "string"
  );
}

// Array type guards using the generic helper
export function isPersonaArray(x: unknown): x is Doc<"personas">[] {
  return isValidArray(x, isPersona);
}

export function isApiKeysArray(x: unknown): x is Doc<"userApiKeys">[] {
  return isValidArray(x, isUserApiKey);
}

export function isUserModelsArray(x: unknown): x is Doc<"userModels">[] {
  return isValidArray(x, isUserModel);
}

// Keep only commonly used non-Doc type guards
export function isMonthlyUsage(x: unknown): x is {
  monthlyMessagesSent: number;
  monthlyLimit: number;
  remainingMessages: number;
  resetDate?: number;
} {
  return (
    !!x &&
    typeof x === "object" &&
    "monthlyMessagesSent" in x &&
    "monthlyLimit" in x &&
    typeof (x as Record<string, unknown>).monthlyMessagesSent === "number" &&
    typeof (x as Record<string, unknown>).monthlyLimit === "number"
  );
}

// Helper for paginated query results
export function hasPageArray(x: unknown): x is { page: unknown[] } {
  return (
    !!x &&
    typeof x === "object" &&
    "page" in x &&
    Array.isArray((x as Record<string, unknown>).page)
  );
}

// Note: Single-use type guards have been moved inline to their respective components
// to avoid over-engineering. This file now contains only frequently-used type guards.

import { type UserId } from "@/types";

import {
  getAnonymousUserIdFromCookie,
  setAnonymousUserIdCookie,
} from "./cookies";

const ANONYMOUS_USER_ID_KEY = "anonymous-user-id";
const ANONYMOUS_USER_CREATED_EVENT = "anonymous-user-created";

/**
 * Get stored anonymous user ID from cookies first, then migrate from localStorage
 */
export function getStoredAnonymousUserId(): UserId | null {
  if (typeof window === "undefined") {
    return null;
  }

  // First try cookies (new approach)
  let userId = getAnonymousUserIdFromCookie();

  // If not in cookies, try localStorage (old approach) and migrate
  if (!userId) {
    userId = localStorage.getItem(ANONYMOUS_USER_ID_KEY) as UserId | null;
    if (userId) {
      // Migrate to cookie
      setAnonymousUserIdCookie(userId);
      localStorage.removeItem(ANONYMOUS_USER_ID_KEY);
    }
  }

  return userId;
}

/**
 * Store anonymous user ID and notify listeners
 * @param userId
 */
export function storeAnonymousUserId(userId: UserId) {
  if (typeof window === "undefined") {
    return;
  }

  setAnonymousUserIdCookie(userId);

  // Dispatch custom event to notify other components
  const event = new CustomEvent(ANONYMOUS_USER_CREATED_EVENT, {
    detail: { userId },
  });
  window.dispatchEvent(event);
}

/**
 * Subscribe to anonymous user creation events
 * @param callback
 */
export function onAnonymousUserCreated(
  callback: (userId: UserId) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ userId: UserId }>;
    callback(customEvent.detail.userId);
  };

  window.addEventListener(ANONYMOUS_USER_CREATED_EVENT, handler);
  return () =>
    window.removeEventListener(ANONYMOUS_USER_CREATED_EVENT, handler);
}

/**
 * Subscribe to changes in stored user ID (from any source)
 * @param callback
 */
export function onStoredUserIdChange(
  callback: (hasUserId: boolean) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const checkAndNotify = () => {
    const hasUserId = Boolean(getStoredAnonymousUserId());
    callback(hasUserId);
  };

  // Check when the window receives focus (in case cookie was set in another tab)
  const handleFocus = () => checkAndNotify();

  // Listen for storage events from other tabs
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === ANONYMOUS_USER_ID_KEY) {
      checkAndNotify();
    }
  };

  // Listen for custom event when anonymous user is created
  const handleUserCreated = () => {
    // Small delay to ensure cookie is set
    setTimeout(checkAndNotify, 100);
  };

  window.addEventListener("focus", handleFocus);
  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(ANONYMOUS_USER_CREATED_EVENT, handleUserCreated);

  // Also check periodically for cookie changes (since cookies don't trigger storage events)
  const interval = setInterval(checkAndNotify, 1000);

  return () => {
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(ANONYMOUS_USER_CREATED_EVENT, handleUserCreated);
    clearInterval(interval);
  };
}

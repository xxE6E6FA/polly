import type { Doc } from "@convex/_generated/dataModel";
import type { UserId } from "@/types";

import {
  removeAnonymousUserIdCookie,
  setAnonymousUserIdCookie,
} from "./cookies";

const ANONYMOUS_USER_CREATED_EVENT = "anonymous-user-created";
const AUTHENTICATED_USER_UPDATED_EVENT = "authenticated-user-updated";

export function storeAnonymousUserId(userId: UserId) {
  setAnonymousUserIdCookie(userId);

  const event = new CustomEvent(ANONYMOUS_USER_CREATED_EVENT, {
    detail: { userId },
  });
  window.dispatchEvent(event);
}

export function cleanupAnonymousUserId() {
  removeAnonymousUserIdCookie();
}

export function onAnonymousUserCreated(
  callback: (userId: UserId) => void
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ userId: UserId }>;
    callback(customEvent.detail.userId);
  };

  window.addEventListener(ANONYMOUS_USER_CREATED_EVENT, handler);
  return () =>
    window.removeEventListener(ANONYMOUS_USER_CREATED_EVENT, handler);
}

export function storeAuthenticatedUser(user: Doc<"users">) {
  localStorage.setItem("authenticated-user", JSON.stringify(user));
  window.dispatchEvent(new Event(AUTHENTICATED_USER_UPDATED_EVENT));
}

export function getStoredAuthenticatedUser() {
  const raw = localStorage.getItem("authenticated-user");
  if (!raw) {
    return null;
  }
  try {
    const user = JSON.parse(raw);
    return user;
  } catch {
    return null;
  }
}

export function cleanupAuthenticatedUser() {
  // biome-ignore lint/suspicious/noConsole: debug
  console.log("[auth-utils] cleanupAuthenticatedUser called");
  localStorage.removeItem("authenticated-user");
  window.dispatchEvent(new Event(AUTHENTICATED_USER_UPDATED_EVENT));
}

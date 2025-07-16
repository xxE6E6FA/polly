import type { UserId } from "@/types";

const ANONYMOUS_USER_COOKIE = "anonymous-user-id";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Client-side: Set anonymous user ID cookie

export function setAnonymousUserIdCookie(userId: UserId) {
  if (typeof window !== "undefined") {
    // More explicit cookie settings
    const isSecure = window.location.protocol === "https:";
    const cookieString = `${ANONYMOUS_USER_COOKIE}=${userId}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${isSecure ? "; Secure" : ""}`;
    document.cookie = cookieString;
  }
}

export function getAnonymousUserIdFromCookie(): UserId | null {
  const cookies = document.cookie.split(";");
  const cookie = cookies.find(c =>
    c.trim().startsWith(`${ANONYMOUS_USER_COOKIE}=`)
  );

  return cookie ? (cookie.split("=")[1].trim() as UserId) : null;
}

export function removeAnonymousUserIdCookie() {
  document.cookie = `${ANONYMOUS_USER_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

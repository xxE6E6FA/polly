import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  getAnonymousUserIdFromCookie,
  removeAnonymousUserIdCookie,
} from "@/lib/cookies";
import { UserId } from "@/types";
import { api } from "convex/_generated/api";
import { ConvexError } from "convex/values";
import { ROUTES } from "@/lib/routes";

type GraduationState = "pending" | "processing" | "success" | "error";
type ErrorType =
  | "graduation_failed"
  | "network_error"
  | "user_not_found"
  | "unknown";

interface AuthError {
  type: ErrorType;
  message: string;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authToken = useAuthToken();
  const authenticatedUser = useQuery(api.users.getCurrentUser);
  const graduateOrMergeUser = useMutation(
    api.users.graduateOrMergeAnonymousUser
  );

  // Track graduation state and errors
  const [graduationState, setGraduationState] =
    useState<GraduationState>("pending");
  const [error, setError] = useState<AuthError | null>(null);

  // Get redirect URL - always go home after auth
  const getRedirectUrl = useCallback(() => {
    return ROUTES.HOME;
  }, []);

  // Handle user graduation when authenticated
  useEffect(() => {
    // Check if we have an auth token (faster than waiting for user query)
    if (!authToken) {
      // No auth token means not authenticated - might be OAuth callback in progress
      // Wait a bit before redirecting
      const timer = setTimeout(() => {
        navigate(ROUTES.HOME);
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Still loading the authenticated user details
    if (authenticatedUser === undefined) return;

    // Auth token exists but no user record yet - might be creating
    if (authenticatedUser === null) {
      // Wait a bit for user creation to complete
      const timer = setTimeout(() => {
        setError({
          type: "user_not_found",
          message: "Unable to load user profile. Please try signing in again.",
        });
        setGraduationState("error");
      }, 5000);
      return () => clearTimeout(timer);
    }

    // We have both auth token and user record - check if we need to graduate
    const anonymousUserId = getAnonymousUserIdFromCookie() as UserId | null;

    if (!anonymousUserId) {
      // No anonymous user to graduate - just redirect
      setGraduationState("success");
      return;
    }

    // We have both authenticated and anonymous users - perform graduation
    if (graduationState === "pending") {
      setGraduationState("processing");

      graduateOrMergeUser({
        anonymousUserId,
        authenticatedUserId: authenticatedUser._id,
      })
        .then(() => {
          // Clean up anonymous state
          removeAnonymousUserIdCookie();
          localStorage.removeItem("anonymous-user-id");

          // Dispatch event for other components
          window.dispatchEvent(
            new CustomEvent("user-graduated", {
              detail: {
                userId: authenticatedUser._id,
                previousUserId: anonymousUserId,
              },
            })
          );

          // Track successful authentication
          console.log("[Auth] User graduation successful", {
            authenticatedUserId: authenticatedUser._id,
            anonymousUserId,
            timestamp: Date.now(),
          });

          setGraduationState("success");
        })
        .catch(err => {
          console.error("[Auth] Failed to graduate user:", err);

          // Determine error type
          let errorType: ErrorType = "unknown";
          let errorMessage = "Something went wrong during sign in.";

          if (err instanceof ConvexError) {
            errorMessage = err.message;
            errorType = "graduation_failed";
          } else if (err instanceof Error && err.message.includes("network")) {
            errorType = "network_error";
            errorMessage = "Network error. Please check your connection.";
          }

          setError({ type: errorType, message: errorMessage });
          setGraduationState("error");
        });
    }
  }, [
    authToken,
    authenticatedUser,
    graduateOrMergeUser,
    graduationState,
    navigate,
  ]);

  // Handle redirect after graduation completes
  useEffect(() => {
    if (graduationState === "success") {
      const timer = setTimeout(() => {
        navigate(getRedirectUrl());
      }, 1500);

      return () => clearTimeout(timer);
    } else if (graduationState === "error") {
      const timer = setTimeout(() => {
        // On error, still redirect but to home
        navigate(ROUTES.HOME);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [graduationState, navigate, getRedirectUrl]);

  // Fallback redirect with longer timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      console.warn("[Auth] Fallback redirect triggered");
      navigate(ROUTES.HOME);
    }, 10000); // Increased to 10 seconds

    return () => clearTimeout(timer);
  }, [navigate]);

  // Determine display status based on current state
  const displayStatus =
    graduationState === "error"
      ? "error"
      : graduationState === "success"
        ? "success"
        : "processing";

  // Check if we should show graduation-specific messages
  const hasAnonymousUser = !!getAnonymousUserIdFromCookie();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8 p-8 text-center">
        <div className="flex justify-center mb-6">
          <img
            src="/polly-mascot.png"
            alt="Polly mascot"
            width={96}
            height={96}
            className="h-24 w-24"
            loading="eager"
          />
        </div>

        <div className="space-y-4" role="status" aria-live="polite">
          {displayStatus === "processing" && (
            <>
              <div
                className="h-16 w-16 animate-spin rounded-full border-4 border-foreground/20 mx-auto"
                style={{
                  borderTopColor: "hsl(var(--color-primary))",
                  borderRightColor: "hsl(var(--color-primary))",
                }}
                aria-hidden="true"
              />
              <h2 className="text-xl font-semibold text-foreground">
                Setting up your account...
              </h2>
              <p className="text-muted-foreground">
                {hasAnonymousUser
                  ? "Preserving your conversations and settings"
                  : "Completing authentication..."}
              </p>
              <p className="text-sm text-muted-foreground/60">
                This should only take a moment
              </p>
            </>
          )}

          {displayStatus === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <svg
                  className="w-8 h-8 text-success"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Welcome to Polly!
              </h2>
              <p className="text-success">
                {hasAnonymousUser
                  ? "Your conversations have been preserved!"
                  : "Authentication successful!"}
              </p>
              <p className="text-sm text-muted-foreground">
                Redirecting you now...
              </p>
            </>
          )}

          {displayStatus === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <svg
                  className="w-8 h-8 text-destructive"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {error?.type === "network_error"
                  ? "Connection Error"
                  : "Something went wrong"}
              </h2>
              <p className="text-muted-foreground">
                {error?.message || "But you're still logged in. Redirecting..."}
              </p>
              {error?.type === "graduation_failed" && hasAnonymousUser && (
                <p className="text-sm text-muted-foreground/60">
                  Your anonymous data may not have been transferred
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

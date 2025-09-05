import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { CACHE_KEYS, set } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";

export default function AuthPage() {
  const { signIn } = useAuthActions();
  const { user } = useUserDataContext();
  const managedToast = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = useCallback(async () => {
    try {
      setIsLoading(true);

      // Store the anonymous user ID for graduation
      if (user?._id && user.isAnonymous) {
        set(CACHE_KEYS.anonymousUserGraduation, user._id);
      }

      await signIn("google", {
        redirectTo: ROUTES.HOME,
      });
    } catch (_error) {
      managedToast.error("Failed to sign in. Please try again.");
      setIsLoading(false);
    }
  }, [signIn, user, managedToast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md stack-xl p-6">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <img
              alt="Polly mascot"
              className="h-24 w-24"
              height={96}
              src="/polly-mascot.png"
              width={96}
            />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-foreground">
            Welcome to Polly
          </h1>
          <p className="text-muted-foreground">
            Sign in to continue with your AI conversations
          </p>
        </div>

        <div className="stack-lg">
          <Button
            className="flex w-full items-center justify-center gap-3 py-6"
            disabled={isLoading}
            variant="outline"
            onClick={handleSignIn}
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="currentColor"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="currentColor"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="currentColor"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="currentColor"
                />
              </svg>
            )}
            {isLoading ? "Signing in..." : "Continue with Google"}
          </Button>
        </div>
      </div>
    </div>
  );
}

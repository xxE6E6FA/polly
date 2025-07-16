import { useAuthToken } from "@convex-dev/auth/react";
import { type ReactNode, Suspense, useEffect } from "react";
import { useNavigate } from "react-router";

import { Spinner } from "@/components/spinner";
import { useUserData } from "@/hooks/use-user-data";
import { ROUTES } from "@/lib/routes";

export const ProtectedSuspense = ({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => {
  const token = useAuthToken();
  const navigate = useNavigate();
  const userData = useUserData();
  const user = userData?.user;
  const isLoading = !userData;

  const isAuthenticated = Boolean(token) && Boolean(user) && !user?.isAnonymous;

  // Handle redirection
  useEffect(() => {
    if (!(isLoading || isAuthenticated)) {
      navigate(ROUTES.AUTH, { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Show single loading state for both auth check and lazy loading
  if (isLoading || !isAuthenticated) {
    return fallback || <ProtectedRouteSkeleton isLoading />;
  }

  return (
    <Suspense fallback={fallback || <ProtectedRouteSkeleton isLoading />}>
      {children}
    </Suspense>
  );
};

const ProtectedRouteSkeleton = ({
  isLoading = false,
}: {
  isLoading?: boolean;
}) => {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-3 text-center">
        {isLoading ? (
          <Spinner size="md" />
        ) : (
          <>
            <div className="text-4xl opacity-20">🔐</div>
            <p className="text-muted-foreground">
              Redirecting to authentication...
            </p>
          </>
        )}
      </div>
    </div>
  );
};

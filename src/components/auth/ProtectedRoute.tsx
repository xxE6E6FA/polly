import { ReactNode, useEffect, Suspense } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useUser } from "../../hooks/use-user";
import { useNavigate } from "react-router";
import { ROUTES } from "@/lib/routes";
import { Spinner } from "@/components/spinner";

export function ProtectedSuspense({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const token = useAuthToken();
  const navigate = useNavigate();
  const { user, isLoading } = useUser();

  const isAuthenticated = !!token && !!user && !user.isAnonymous;

  // Handle redirection
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
}

function ProtectedRouteSkeleton({
  isLoading = false,
}: {
  isLoading?: boolean;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-3">
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
}

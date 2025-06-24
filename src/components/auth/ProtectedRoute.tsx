import { ReactNode, useEffect } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useUser } from "../../hooks/use-user";
import { useNavigate } from "react-router";
import { ROUTES } from "@/lib/routes";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
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

  if (isLoading) {
    return <ProtectedRouteSkeleton isLoading />;
  }

  if (!isAuthenticated) {
    return <ProtectedRouteSkeleton />;
  }

  return <>{children}</>;
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-muted-foreground mx-auto"></div>
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

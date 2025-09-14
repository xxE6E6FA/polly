import { type ReactNode, Suspense, useEffect } from "react";
import { useNavigate } from "react-router";
import { Spinner } from "@/components/spinner";
import { ROUTES } from "@/lib/routes";
import { useUserDataContext } from "@/providers/user-data-context";

export const ProtectedSuspense = ({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useUserDataContext();

  useEffect(() => {
    if (!(isLoading || isAuthenticated)) {
      navigate(ROUTES.AUTH, { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

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
    <div className="flex min-h-[100dvh] items-center justify-center">
      <div className="stack-md text-center">
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

import { useRouteError, isRouteErrorResponse } from "react-router";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "@phosphor-icons/react";
import { ROUTES } from "@/lib/routes";

export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center max-w-md">
            <WarningIcon className="w-16 h-16 text-destructive mb-4" />
            <h1 className="text-2xl font-bold mb-2">404 - Page Not Found</h1>
            <p className="text-muted-foreground mb-8">
              The page you're looking for doesn't exist.
            </p>
            <Button onClick={() => (window.location.href = ROUTES.HOME)}>
              Go Home
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <WarningIcon className="w-16 h-16 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">
            {error.status} {error.statusText}
          </h1>
          {error.data?.message && (
            <p className="text-muted-foreground mb-8">{error.data.message}</p>
          )}
          <Button onClick={() => (window.location.href = ROUTES.HOME)}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="flex flex-col items-center text-center max-w-md">
        <WarningIcon className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-8">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred"}
        </p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  );
}

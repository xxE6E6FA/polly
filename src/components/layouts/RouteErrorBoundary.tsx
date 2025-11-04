import { WarningIcon } from "@phosphor-icons/react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

export const RouteErrorBoundary = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="max-w-md text-center">
            <WarningIcon className="mb-4 h-16 w-16 text-destructive" />
            <h1 className="mb-2 text-2xl font-bold">404 - Page Not Found</h1>
            <p className="mb-8 text-muted-foreground">
              The page you're looking for doesn't exist.
            </p>
            <Button asChild>
              <Link to={ROUTES.HOME}>Go Home</Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="max-w-md text-center">
          <WarningIcon className="mb-4 h-16 w-16 text-destructive" />
          <h1 className="mb-2 text-2xl font-bold">
            {error.status} {error.statusText}
          </h1>
          {error.data?.message && (
            <p className="mb-8 text-muted-foreground">{error.data.message}</p>
          )}
          <Button asChild>
            <Link to={ROUTES.HOME}>Go Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex max-w-md flex-col items-center text-center">
        <WarningIcon className="mb-4 h-16 w-16 text-destructive" />
        <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
        <p className="mb-8 text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred"}
        </p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  );
};

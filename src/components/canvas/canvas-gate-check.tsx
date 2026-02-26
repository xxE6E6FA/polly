import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { ROUTES } from "@/lib/routes";

export function CanvasGateCheck({ children }: { children: React.ReactNode }) {
  const { hasReplicateApiKey, isLoading } = useReplicateApiKey();

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!hasReplicateApiKey) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="mx-auto max-w-md text-center stack-md">
          <h2 className="text-lg font-semibold">Replicate API Key Required</h2>
          <p className="text-sm text-muted-foreground">
            Canvas mode uses your Replicate API key for image generation. Add
            your key in settings to get started.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to={ROUTES.HOME}>
              <Button variant="ghost" size="sm">
                Back to Chat
              </Button>
            </Link>
            <Link to={ROUTES.SETTINGS.API_KEYS}>
              <Button size="sm">Add API Key</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

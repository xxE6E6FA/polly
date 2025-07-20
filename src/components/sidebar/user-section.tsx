import type { Doc } from "@convex/types";
import { SignInIcon, UserIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/hooks/use-user-settings";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import { preloadSettings } from "@/routes";

type UserSectionContentProps = {
  user: Doc<"users"> | null | undefined;
  isAuthenticated: boolean;
  shouldAnonymize: boolean;
};

const UserSectionContent = ({
  user,
  isAuthenticated,
  shouldAnonymize,
}: UserSectionContentProps) => {
  if (!isAuthenticated) {
    return (
      <Link className="block w-full px-3 py-2" to={ROUTES.AUTH}>
        <Button
          className="flex h-9 w-full items-center justify-start gap-2.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          variant="ghost"
        >
          <SignInIcon className="h-4 w-4" />
          Sign In
        </Button>
      </Link>
    );
  }

  return (
    <Link
      className="block w-full p-2"
      to={ROUTES.SETTINGS.ROOT}
      onMouseEnter={preloadSettings}
    >
      <Button
        className="h-9 w-full justify-start gap-2.5 text-sm hover:bg-accent/50"
        variant="ghost"
      >
        {user?.image ? (
          <img
            alt={user.name || "User avatar"}
            className={cn(
              "h-6 w-6 rounded-full object-cover",
              shouldAnonymize && "blur-sm"
            )}
            loading="lazy"
            src={user.image}
            onError={e => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) {
                fallback.style.display = "flex";
              }
            }}
          />
        ) : (
          <div
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded-full bg-gradient-to-br from-accent-coral to-accent-purple",
              shouldAnonymize && "blur-sm"
            )}
          >
            <UserIcon className="h-3 w-3 text-white" />
          </div>
        )}
        <span
          className={cn(
            "truncate text-foreground",
            shouldAnonymize && "blur-md"
          )}
        >
          {user?.name || user?.email || "User"}
        </span>
      </Button>
    </Link>
  );
};

export const UserSection = () => {
  const { user } = useUserDataContext();
  const userSettings = useUserSettings();

  const isAuthenticated = user && !user.isAnonymous;
  const shouldAnonymize = userSettings?.anonymizeForDemo ?? false;

  if (user === undefined) {
    return <UserSectionSkeleton />;
  }

  if (user === null) {
    return (
      <UserSectionContent
        isAuthenticated={false}
        user={null}
        shouldAnonymize={false}
      />
    );
  }

  return (
    <UserSectionContent
      isAuthenticated={Boolean(isAuthenticated)}
      user={user}
      shouldAnonymize={shouldAnonymize}
    />
  );
};

const UserSectionSkeleton = () => {
  return (
    <div className="px-3 py-2">
      <div className="h-9 animate-pulse rounded-md bg-muted/40" />
    </div>
  );
};

import { Link } from "react-router";

import { SignInIcon, UserIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { preloadSettings } from "@/routes";
import { cn } from "@/lib/utils";

import { useUser } from "../../hooks/use-user";
import { useUserSettings } from "../../hooks/use-user-settings";

type UserSectionContentProps = {
  user:
    | {
        _id: string;
        _creationTime: number;
        name?: string;
        email?: string;
        emailVerified?: number;
        emailVerificationTime?: number;
        image?: string;
        isAnonymous?: boolean;
        messagesSent?: number;
        createdAt?: number;
      }
    | null
    | undefined;
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
  const { user, isLoading } = useUser();
  const userSettings = useUserSettings();

  const isAuthenticated = user && !user.isAnonymous;
  const shouldAnonymize = userSettings?.anonymizeForDemo ?? false;

  // Only show skeleton if we have no user data at all (no cache and loading)
  // With caching, user will typically have data even while isLoading is true
  if (isLoading && !user) {
    return <UserSectionSkeleton />;
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

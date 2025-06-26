import { Link } from "react-router";

import { SignInIcon, UserIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { preloadSettings } from "@/routes";

import { useUser } from "../../hooks/use-user";

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
};

const UserSectionContent = ({
  user,
  isAuthenticated,
}: UserSectionContentProps) => {
  if (!isAuthenticated) {
    return (
      <Link className="block w-full px-3 py-3" to={ROUTES.AUTH}>
        <Button
          className="flex h-10 w-full items-center justify-start gap-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
      className="block w-full px-3 py-3"
      to={ROUTES.SETTINGS.ROOT}
      onMouseEnter={preloadSettings}
    >
      <Button
        className="h-10 w-full justify-start gap-3 text-sm hover:bg-accent/50"
        variant="ghost"
      >
        {user?.image ? (
          <img
            alt={user.name || "User avatar"}
            className="h-6 w-6 rounded-full object-cover"
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
          <div className="h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent-coral to-accent-purple">
            <UserIcon className="h-3 w-3 text-white" />
          </div>
        )}
        <span className="truncate text-foreground">
          {user?.name || user?.email || "User"}
        </span>
      </Button>
    </Link>
  );
};

export const UserSection = () => {
  const { user, isLoading } = useUser();

  const isAuthenticated = user && !user.isAnonymous;

  // Only show skeleton if we have no user data at all (no cache and loading)
  // With caching, user will typically have data even while isLoading is true
  if (isLoading && !user) {
    return <UserSectionSkeleton />;
  }

  return (
    <UserSectionContent
      isAuthenticated={Boolean(isAuthenticated)}
      user={user}
    />
  );
};

const UserSectionSkeleton = () => {
  return (
    <div className="px-3 py-3">
      <div className="h-10 animate-pulse rounded-md bg-muted/40" />
    </div>
  );
};

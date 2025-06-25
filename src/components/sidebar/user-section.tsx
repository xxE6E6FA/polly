import { UserIcon, SignInIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { useUser } from "../../hooks/use-user";
import { ROUTES } from "@/lib/routes";
import { preloadSettings } from "@/routes";

interface UserSectionContentProps {
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
}

function UserSectionContent({
  user,
  isAuthenticated,
}: UserSectionContentProps) {
  if (!isAuthenticated) {
    return (
      <Link to={ROUTES.AUTH} className="block w-full px-3 py-3">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent/50 text-sm h-10"
        >
          <SignInIcon className="h-4 w-4" />
          Sign In
        </Button>
      </Link>
    );
  }

  return (
    <Link
      to={ROUTES.SETTINGS.ROOT}
      className="block w-full px-3 py-3"
      onMouseEnter={preloadSettings}
    >
      <Button
        variant="ghost"
        className="w-full justify-start gap-3 hover:bg-accent/50 h-10 text-sm"
      >
        {user?.image ? (
          <img
            src={user.image}
            alt={user.name || "User avatar"}
            className="rounded-full object-cover w-6 h-6"
            loading="lazy"
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
          <div className="rounded-full bg-gradient-to-br from-accent-coral to-accent-purple items-center justify-center w-6 h-6">
            <UserIcon className="text-white h-3 w-3" />
          </div>
        )}
        <span className="truncate text-foreground">
          {user?.name || user?.email || "User"}
        </span>
      </Button>
    </Link>
  );
}

export function UserSection() {
  const { user, isLoading } = useUser();

  const isAuthenticated = user && !user.isAnonymous;

  // Only show skeleton if we have no user data at all (no cache and loading)
  // With caching, user will typically have data even while isLoading is true
  if (isLoading && !user) {
    return <UserSectionSkeleton />;
  }

  return <UserSectionContent user={user} isAuthenticated={!!isAuthenticated} />;
}

function UserSectionSkeleton() {
  return (
    <div className="px-3 py-3">
      <div className="rounded-md bg-muted/40 animate-pulse h-10" />
    </div>
  );
}

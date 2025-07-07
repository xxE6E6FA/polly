import { ArrowLeftIcon, SignOutIcon } from "@phosphor-icons/react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuthWithCache } from "@/hooks/use-auth-with-cache";
import { cn } from "@/lib/utils";

type SettingsHeaderProps = {
  // For page headers (new usage)
  title?: string;
  description?: string;
  className?: string;

  // For navigation headers (existing usage)
  backLink?: string;
  backText?: string;
};

// Client component for navigation header with auth actions

const NavigationHeader = ({
  backLink,
  backText,
}: {
  backLink: string;
  backText: string;
}) => {
  const authActions = useAuthWithCache();

  return (
    <div className="flex-shrink-0 border-b border-border/40">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <Link to={backLink}>
            <Button className="h-8 px-2 sm:h-9" size="sm" variant="ghost">
              <ArrowLeftIcon className="mr-1 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{backText}</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Button
              className="h-8 px-2 sm:h-8 sm:px-2"
              size="sm"
              variant="ghost"
              onClick={authActions.signOut}
            >
              <SignOutIcon className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsHeader = ({
  title,
  description,
  className,
  backLink,
  backText = "Back to Chat",
}: SettingsHeaderProps) => {
  // Navigation header (existing usage)
  if (backLink) {
    return <NavigationHeader backLink={backLink} backText={backText} />;
  }

  // Page header (new usage)
  if (title && description) {
    return (
      <div className={cn("space-y-2", className)}>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
    );
  }

  // Fallback for invalid usage
  return null;
};

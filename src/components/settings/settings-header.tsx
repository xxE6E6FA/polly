import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { Link } from "react-router";
import { useAuthWithCache } from "@/hooks/use-auth-with-cache";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface SettingsHeaderProps {
  // For page headers (new usage)
  title?: string;
  description?: string;
  className?: string;

  // For navigation headers (existing usage)
  backLink?: string;
  backText?: string;
}

// Client component for navigation header with auth actions
function NavigationHeader({
  backLink,
  backText,
}: {
  backLink: string;
  backText: string;
}) {
  const authActions = useAuthWithCache();

  return (
    <div className="border-b border-border/40 flex-shrink-0">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link to={backLink}>
            <Button variant="ghost" size="sm" className="px-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backText}
            </Button>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={authActions.signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsHeader({
  title,
  description,
  className,
  backLink,
  backText = "Back to Chat",
}: SettingsHeaderProps) {
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
}

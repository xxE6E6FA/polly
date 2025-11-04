import type { Doc } from "@convex/types";
import {
  CheckIcon,
  GearIcon,
  MonitorIcon,
  MoonIcon,
  SignInIcon,
  SignOutIcon,
  SunIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
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

function getThemeIcon(theme: "light" | "dark" | "system") {
  switch (theme) {
    case "light":
      return <SunIcon className="h-4 w-4" />;
    case "dark":
      return <MoonIcon className="h-4 w-4" />;
    case "system":
      return <MonitorIcon className="h-4 w-4" />;
    default:
      return <MonitorIcon className="h-4 w-4" />;
  }
}

const UserSectionContent = ({
  user,
  isAuthenticated,
  shouldAnonymize,
}: UserSectionContentProps) => {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = () => {
    navigate("/signout");
  };

  const handleThemeChange = (value: string) => {
    if (value === "light" || value === "dark" || value === "system") {
      setTheme(value);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="border-t border-border/50">
        <Link className="block w-full" to={ROUTES.AUTH}>
          <Button
            className="flex h-9 w-full items-center rounded-none justify-start gap-5 px-5 py-7 text-sm text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            variant="ghost"
          >
            <SignInIcon className="h-4 w-4" />
            Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-border/50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="rounded-none h-9 w-full justify-start gap-5 px-5 py-7 text-sm hover:bg-accent/70"
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
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem asChild>
            <Link
              to={ROUTES.SETTINGS.ROOT}
              onMouseEnter={preloadSettings}
              className="w-full"
            >
              <GearIcon className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {getThemeIcon(theme)}
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={handleThemeChange}
              >
                <DropdownMenuRadioItem
                  value="light"
                  className={cn(
                    "pl-2",
                    theme === "light" &&
                      "bg-accent font-medium text-accent-foreground [&>span:first-child]:hidden"
                  )}
                >
                  <SunIcon className="mr-2 h-4 w-4" />
                  <span>Light</span>
                  {theme === "light" && (
                    <CheckIcon className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="dark"
                  className={cn(
                    "pl-2",
                    theme === "dark" &&
                      "bg-accent font-medium text-accent-foreground [&>span:first-child]:hidden"
                  )}
                >
                  <MoonIcon className="mr-2 h-4 w-4" />
                  <span>Dark</span>
                  {theme === "dark" && (
                    <CheckIcon className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="system"
                  className={cn(
                    "pl-2",
                    theme === "system" &&
                      "bg-accent font-medium text-accent-foreground [&>span:first-child]:hidden"
                  )}
                >
                  <MonitorIcon className="mr-2 h-4 w-4" />
                  <span>System</span>
                  {theme === "system" && (
                    <CheckIcon className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-red-600 dark:text-red-400"
          >
            <SignOutIcon className="h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
    <div className="border-t border-border/50 pt-4 pb-3">
      <div className="h-9 animate-pulse rounded-md bg-muted/40 px-3" />
    </div>
  );
};

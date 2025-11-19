import type { Doc } from "@convex/types";
import {
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

  if (!isAuthenticated) {
    return (
      <div className="border-t border-border/50">
        <Link className="block w-full" to={ROUTES.AUTH}>
          <Button
            className="flex h-auto w-full items-center rounded-none justify-start gap-3 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
            variant="ghost"
          >
            <SignInIcon className="h-4 w-4" />
            <span className="font-medium">Sign In</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-border/50">
      <DropdownMenu>
        <DropdownMenuTrigger className="cursor-pointer rounded-none h-auto w-full justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors border-0 bg-transparent flex items-center text-left">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {user?.image ? (
              <img
                alt={user.name || "User avatar"}
                className={cn(
                  "h-7 w-7 rounded-full object-cover flex-shrink-0",
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
                  "h-7 w-7 flex items-center justify-center rounded-full bg-gradient-to-br from-accent-coral to-accent-purple flex-shrink-0",
                  shouldAnonymize && "blur-sm"
                )}
              >
                <UserIcon className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <span
              className={cn(
                "truncate text-foreground text-sm font-medium",
                shouldAnonymize && "blur-md"
              )}
            >
              {user?.name || user?.email || "User"}
            </span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          sideOffset={4}
          align="center"
          side="top"
          className="w-48"
        >
          <DropdownMenuItem onClick={() => navigate(ROUTES.SETTINGS.ROOT)}>
            <GearIcon className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {getThemeIcon(theme)}
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={value => {
                  if (
                    value === "light" ||
                    value === "dark" ||
                    value === "system"
                  ) {
                    setTheme(value);
                  }
                }}
              >
                <DropdownMenuRadioItem value="light">
                  <SunIcon className="h-4 w-4" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon className="h-4 w-4" />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon className="h-4 w-4" />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() => navigate("/signout")}
            className="text-danger"
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
    <div className="border-t border-border/50">
      <div className="px-4 py-3">
        <div className="h-7 animate-pulse rounded-md bg-muted/40" />
      </div>
    </div>
  );
};

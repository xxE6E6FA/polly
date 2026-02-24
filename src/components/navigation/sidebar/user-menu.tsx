import {
  BrainIcon,
  CheckIcon,
  GearIcon,
  KeyIcon,
  MonitorIcon,
  MoonIcon,
  RobotIcon,
  SignOutIcon,
  SunIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTheme } from "@/hooks/use-theme";
import { COLOR_SCHEME_DEFINITIONS } from "@/lib/color-schemes";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUserUsage } from "@/providers/user-data-context";

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: SunIcon },
  { value: "dark" as const, label: "Dark", icon: MoonIcon },
  { value: "system" as const, label: "System", icon: MonitorIcon },
];

const NAV_ITEMS = [
  { icon: GearIcon, label: "Settings", route: ROUTES.SETTINGS.ROOT },
  { icon: BrainIcon, label: "Memory", route: ROUTES.SETTINGS.MEMORY },
  { icon: RobotIcon, label: "Models", route: ROUTES.SETTINGS.TEXT_MODELS },
  { icon: KeyIcon, label: "API Keys", route: ROUTES.SETTINGS.API_KEYS },
];

type UserMenuProps = {
  user:
    | { name?: string | null; email?: string | null; image?: string | null }
    | null
    | undefined;
  shouldAnonymize: boolean;
};

export const UserMenu = memo(({ user, shouldAnonymize }: UserMenuProps) => {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [imgError, setImgError] = useState(false);

  const imageSrc = user?.image && !imgError ? user.image : null;

  const avatar = imageSrc ? (
    <img
      alt={user?.name || "User avatar"}
      className={cn(
        "h-7 w-7 rounded-full object-cover shrink-0",
        shouldAnonymize && "blur-sm"
      )}
      loading="lazy"
      src={imageSrc}
      onError={() => setImgError(true)}
    />
  ) : (
    <div
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded-full bg-gradient-to-br from-accent-coral to-accent-purple shrink-0",
        shouldAnonymize && "blur-sm"
      )}
    >
      <UserIcon className="size-3.5 text-white" />
    </div>
  );

  if (isDesktop) {
    return (
      <DesktopUserMenu
        user={user}
        shouldAnonymize={shouldAnonymize}
        avatar={avatar}
      />
    );
  }

  return (
    <MobileUserMenu
      user={user}
      shouldAnonymize={shouldAnonymize}
      avatar={avatar}
    />
  );
});

// ---------------------------------------------------------------------------
// Shared: User header
// ---------------------------------------------------------------------------

function UserHeader({
  user,
  shouldAnonymize,
  avatar,
  size = "sm",
}: {
  user: UserMenuProps["user"];
  shouldAnonymize: boolean;
  avatar: React.ReactNode;
  size?: "sm" | "lg";
}) {
  const displayName = user?.name ?? "User";
  const displayEmail = user?.email ?? "";

  return (
    <div className={cn("flex items-center gap-2.5", size === "lg" && "gap-3")}>
      <div
        className={cn("shrink-0", size === "lg" && "scale-125 origin-center")}
      >
        {avatar}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium text-foreground",
            size === "sm" ? "text-sm" : "text-base",
            shouldAnonymize && "blur-sm"
          )}
        >
          {displayName}
        </p>
        {displayEmail && (
          <p
            className={cn(
              "truncate text-muted-foreground",
              size === "sm" ? "text-xs" : "text-sm",
              shouldAnonymize && "blur-sm"
            )}
          >
            {displayEmail}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Usage bar
// ---------------------------------------------------------------------------

function UsageBar({ className }: { className?: string }) {
  const { hasMessageLimit, monthlyUsage } = useUserUsage();

  if (!(hasMessageLimit && monthlyUsage)) {
    return null;
  }

  const { remainingMessages, monthlyLimit } = monthlyUsage;
  const used = monthlyLimit - remainingMessages;
  const pct = Math.min(100, (used / monthlyLimit) * 100);
  const isLow = remainingMessages < 10;

  return (
    <div className={cn("stack-xs", className)}>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isLow ? "bg-warning-foreground" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {used}/{monthlyLimit} messages used
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Inline theme mode toggle
// ---------------------------------------------------------------------------

function ThemeModeToggle({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { theme, setTheme, previewMode, endPreview } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md bg-muted/60 p-0.5",
        size === "lg" && "w-full"
      )}
    >
      {THEME_OPTIONS.map(opt => {
        const isActive = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-sm transition-colors",
              size === "sm" ? "h-6 px-2" : "h-8 flex-1 px-3",
              isActive
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTheme(opt.value)}
            onMouseEnter={() => {
              if (size === "sm") {
                previewMode(opt.value);
              }
            }}
            onMouseLeave={() => {
              if (size === "sm") {
                endPreview();
              }
            }}
          >
            <opt.icon className={cn(size === "sm" ? "size-3.5" : "size-4")} />
            {size === "lg" && <span className="text-sm">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Color scheme dots/items
// ---------------------------------------------------------------------------

function ColorSchemeDots({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { colorScheme, setColorScheme, previewScheme, endPreview } = useTheme();
  const isDark = document.documentElement.classList.contains("dark");

  if (size === "lg") {
    return (
      <div className="flex flex-col">
        {COLOR_SCHEME_DEFINITIONS.map(scheme => {
          const isActive = colorScheme === scheme.id;
          const preview = isDark ? scheme.preview.dark : scheme.preview.light;
          return (
            <button
              key={scheme.id}
              type="button"
              className={cn(
                "flex items-center gap-2.5 h-10 px-2 rounded-md transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              onClick={() => setColorScheme(scheme.id)}
            >
              <div className="flex items-center gap-0.5 shrink-0">
                <div
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: preview.primary }}
                />
                <div
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: preview.accent }}
                />
              </div>
              <span className="text-sm">{scheme.name}</span>
              {isActive && <CheckIcon className="size-3.5 ml-auto" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {COLOR_SCHEME_DEFINITIONS.map(scheme => {
        const isActive = colorScheme === scheme.id;
        const preview = isDark ? scheme.preview.dark : scheme.preview.light;
        return (
          <button
            key={scheme.id}
            type="button"
            className={cn(
              "relative rounded-full transition-transform",
              isActive &&
                "ring-2 ring-primary ring-offset-1 ring-offset-popover"
            )}
            title={scheme.name}
            onClick={() => setColorScheme(scheme.id)}
            onMouseEnter={() => previewScheme(scheme.id)}
            onMouseLeave={() => endPreview()}
          >
            <div
              className="size-5 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${preview.primary} 50%, ${preview.accent} 50%)`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop: DropdownMenu variant
// ---------------------------------------------------------------------------

function DesktopUserMenu({
  user,
  shouldAnonymize,
  avatar,
}: UserMenuProps & { avatar: React.ReactNode }) {
  const navigate = useNavigate();
  const { endPreview } = useTheme();

  return (
    <DropdownMenu
      onOpenChange={open => {
        if (!open) {
          endPreview();
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        {avatar}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64"
      >
        {/* User header */}
        <div className="px-2 py-2">
          <UserHeader
            user={user}
            shouldAnonymize={shouldAnonymize}
            avatar={avatar}
          />
        </div>
        <UsageBar className="px-2 pb-1.5" />
        <DropdownMenuSeparator />

        {/* Settings shortcuts */}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate(ROUTES.SETTINGS.ROOT)}>
            <GearIcon className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(ROUTES.SETTINGS.MEMORY)}>
            <BrainIcon className="size-4" />
            Memory
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate(ROUTES.SETTINGS.TEXT_MODELS)}
          >
            <RobotIcon className="size-4" />
            Models
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(ROUTES.SETTINGS.API_KEYS)}>
            <KeyIcon className="size-4" />
            API Keys
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {/* Inline appearance controls */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Mode
          </DropdownMenuLabel>
          <div className="px-2 pb-1.5">
            <ThemeModeToggle size="sm" />
          </div>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Color scheme
          </DropdownMenuLabel>
          <div className="px-2 pb-1.5">
            <ColorSchemeDots size="sm" />
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {/* Sign out */}
        <DropdownMenuItem onClick={() => navigate("/signout")}>
          <SignOutIcon className="size-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Mobile: Drawer variant
// ---------------------------------------------------------------------------

function MobileUserMenu({
  user,
  shouldAnonymize,
  avatar,
}: UserMenuProps & { avatar: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  function handleNav(route: string) {
    setOpen(false);
    navigate(route);
  }

  return (
    <>
      <button
        type="button"
        className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => setOpen(true)}
      >
        {avatar}
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="sr-only">User menu</DrawerTitle>
            <UserHeader
              user={user}
              shouldAnonymize={shouldAnonymize}
              avatar={avatar}
              size="lg"
            />
            <UsageBar className="pt-2" />
          </DrawerHeader>

          <DrawerBody className="stack-md">
            {/* Navigation items */}
            <div className="flex flex-col">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.route}
                  type="button"
                  className="flex items-center gap-2.5 h-12 px-2 rounded-md text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => handleNav(item.route)}
                >
                  <item.icon className="size-5" />
                  <span className="text-sm">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Appearance controls */}
            <div className="stack-md">
              <p className="text-xs font-medium text-muted-foreground px-2">
                Mode
              </p>
              <ThemeModeToggle size="lg" />
            </div>

            <div className="stack-md">
              <p className="text-xs font-medium text-muted-foreground px-2">
                Color scheme
              </p>
              <ColorSchemeDots size="lg" />
            </div>
          </DrawerBody>

          <DrawerFooter>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2.5 text-muted-foreground"
              onClick={() => {
                setOpen(false);
                navigate("/signout");
              }}
            >
              <SignOutIcon className="size-5" />
              Sign Out
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

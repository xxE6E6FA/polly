import {
  CheckIcon,
  GearIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PlusIcon,
  SignOutIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProfileFormDialog } from "@/components/settings/profile-form-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useTheme } from "@/hooks/use-theme";
import { useUserSettings } from "@/hooks/use-user-settings";
import { COLOR_SCHEME_DEFINITIONS } from "@/lib/color-schemes";
import { getProfileIconComponent } from "@/lib/profile-icons";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Profile, ProfileId } from "@/types";

export const SidebarFooter = () => {
  const { user, isAuthenticated, isLoading } = useUserDataContext();
  const userSettings = useUserSettings();
  const shouldAnonymize = userSettings?.anonymizeForDemo ?? false;

  if (isLoading) {
    return <SidebarFooterSkeleton />;
  }

  if (!isAuthenticated) {
    return <UnauthenticatedFooter />;
  }

  return <AuthenticatedFooter user={user} shouldAnonymize={shouldAnonymize} />;
};

const UnauthenticatedFooter = () => {
  const navigate = useNavigate();

  return (
    <div className="border-t border-border/50 px-3 py-2.5">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => navigate(ROUTES.AUTH)}
        >
          Sign In
        </Button>
      </div>
    </div>
  );
};

const AuthenticatedFooter = memo(
  ({
    user,
    shouldAnonymize,
  }: {
    user:
      | { name?: string | null; email?: string | null; image?: string | null }
      | null
      | undefined;
    shouldAnonymize: boolean;
  }) => {
    const {
      activeProfile,
      setActiveProfile,
      profiles,
      isLoading: profilesLoading,
    } = useActiveProfile();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const navigate = useNavigate();
    const hasMultipleProfiles = (profiles?.length ?? 0) >= 2;

    return (
      <>
        <div className="border-t border-border/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {/* Left: Profile switcher */}
            {profilesLoading ? (
              <ProfileSwitcherSkeleton />
            ) : (
              hasMultipleProfiles &&
              profiles && (
                <div className="overflow-x-auto min-w-0 hide-scrollbar rounded-lg bg-sidebar-hover/50 p-0.5">
                  <div className="flex items-center gap-0.5 w-max">
                    {profiles.map(profile => (
                      <ProfileButton
                        key={profile._id}
                        profile={profile}
                        isActive={activeProfile?._id === profile._id}
                        onSelect={setActiveProfile}
                      />
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Center: Add profile */}
            <Tooltip>
              <TooltipTrigger delayDuration={200}>
                <button
                  type="button"
                  className="flex items-center justify-center size-7 rounded-md text-sidebar-muted hover:text-sidebar-foreground transition-colors shrink-0"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New profile</p>
              </TooltipContent>
            </Tooltip>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right: User avatar (opens menu) */}
            <UserMenu
              user={user}
              shouldAnonymize={shouldAnonymize}
              navigate={navigate}
            />
          </div>
        </div>

        <ProfileFormDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </>
    );
  }
);

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: SunIcon },
  { value: "dark" as const, label: "Dark", icon: MoonIcon },
  { value: "system" as const, label: "System", icon: MonitorIcon },
];

const UserMenu = memo(
  ({
    user,
    shouldAnonymize,
    navigate,
  }: {
    user:
      | { name?: string | null; email?: string | null; image?: string | null }
      | null
      | undefined;
    shouldAnonymize: boolean;
    navigate: (path: string) => void;
  }) => {
    const {
      theme,
      setTheme,
      colorScheme,
      setColorScheme,
      previewScheme,
      previewMode,
      endPreview,
    } = useTheme();

    const avatar = user?.image ? (
      <img
        alt={user.name || "User avatar"}
        className={cn(
          "h-7 w-7 rounded-full object-cover shrink-0",
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
          "h-7 w-7 flex items-center justify-center rounded-full bg-gradient-to-br from-accent-coral to-accent-purple shrink-0",
          shouldAnonymize && "blur-sm"
        )}
      >
        <UserIcon className="size-3.5 text-white" />
      </div>
    );

    return (
      <DropdownMenu>
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
        <DropdownMenuContent side="top" align="end" sideOffset={8}>
          <DropdownMenuItem onClick={() => navigate(ROUTES.SETTINGS.ROOT)}>
            <GearIcon className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(ROUTES.SETTINGS.GENERAL)}>
            <UsersIcon className="size-4" />
            Manage Profiles
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub
            onOpenChange={open => {
              if (!open) {
                endPreview();
              }
            }}
          >
            <DropdownMenuSubTrigger className="gap-2">
              <PaletteIcon className="size-4" />
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Mode
                </DropdownMenuLabel>
                {THEME_OPTIONS.map(opt => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    onMouseEnter={() => previewMode(opt.value)}
                    className={cn(
                      theme === opt.value && "bg-muted font-medium"
                    )}
                  >
                    <opt.icon className="size-4" />
                    {opt.label}
                    {theme === opt.value && (
                      <CheckIcon className="size-3.5 ml-auto" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Color scheme
                </DropdownMenuLabel>
                {COLOR_SCHEME_DEFINITIONS.map(scheme => {
                  const isActive = colorScheme === scheme.id;
                  const isDark =
                    document.documentElement.classList.contains("dark");
                  const preview = isDark
                    ? scheme.preview.dark
                    : scheme.preview.light;
                  return (
                    <DropdownMenuItem
                      key={scheme.id}
                      onClick={() => setColorScheme(scheme.id)}
                      onMouseEnter={() => previewScheme(scheme.id)}
                      className={cn(isActive && "bg-muted font-medium")}
                    >
                      <div className="flex items-center gap-0.5 shrink-0">
                        <div
                          className="size-3 rounded-full"
                          style={{ backgroundColor: preview.primary }}
                        />
                        <div
                          className="size-3 rounded-full"
                          style={{ backgroundColor: preview.accent }}
                        />
                      </div>
                      {scheme.name}
                      {isActive && <CheckIcon className="size-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/signout")}>
            <SignOutIcon className="size-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

const ProfileButton = memo(
  ({
    profile,
    isActive,
    onSelect,
  }: {
    profile: Profile;
    isActive: boolean;
    onSelect: (id: ProfileId) => void;
  }) => {
    const IconComponent = getProfileIconComponent(profile.icon);

    return (
      <Tooltip>
        <TooltipTrigger delayDuration={200}>
          <button
            type="button"
            className={cn(
              "relative flex items-center justify-center size-7 rounded-md transition-colors shrink-0",
              isActive
                ? "text-foreground"
                : "text-sidebar-muted hover:text-sidebar-foreground"
            )}
            onClick={() => onSelect(profile._id)}
          >
            {isActive && (
              <motion.div
                layoutId="profile-indicator"
                className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-border/50"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative">
              {IconComponent ? (
                <IconComponent
                  className="size-3.5"
                  weight={isActive ? "fill" : "regular"}
                />
              ) : (
                <span className="text-xs">{profile.name[0]}</span>
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{profile.name}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
);

const ProfileSwitcherSkeleton = () => (
  <div className="flex items-center gap-0.5 rounded-lg bg-sidebar-hover/50 p-0.5">
    <div className="size-7 animate-pulse rounded-md bg-muted/40" />
    <div className="size-7 animate-pulse rounded-md bg-muted/40" />
  </div>
);

const SidebarFooterSkeleton = () => {
  return (
    <div className="border-t border-border/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="size-7 animate-pulse rounded-md bg-muted/40" />
        <div className="flex-1" />
        <div className="size-7 animate-pulse rounded-full bg-muted/40" />
      </div>
    </div>
  );
};

import { PlusIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProfileFormDialog } from "@/components/settings/profile-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useUserSettings } from "@/hooks/use-user-settings";
import { getProfileIconComponent } from "@/lib/profile-icons";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Profile, ProfileId } from "@/types";
import { UserMenu } from "./user-menu";

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
            <UserMenu user={user} shouldAnonymize={shouldAnonymize} />
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

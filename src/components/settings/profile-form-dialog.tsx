import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getProfileIconComponent } from "@/lib/profile-icons";
import type { Profile } from "@/types";
import { ProfileIconPicker } from "./profile-icon-picker";

type ProfileFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: Profile; // If provided, edit mode
};

export function ProfileFormDialog({
  open,
  onOpenChange,
  profile,
}: ProfileFormDialogProps) {
  const isEditing = !!profile;
  const [name, setName] = useState(profile?.name ?? "");
  const [icon, setIcon] = useState(profile?.icon ?? "Briefcase");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const createProfile = useMutation(api.profiles.create);
  const updateProfile = useMutation(api.profiles.update);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }

      startTransition(async () => {
        if (isEditing && profile) {
          await updateProfile({ id: profile._id, name: trimmed, icon });
        } else {
          await createProfile({ name: trimmed, icon });
        }
        onOpenChange(false);
      });
    },
    [name, icon, isEditing, profile, createProfile, updateProfile, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Reset form when opening
        setName(profile?.name ?? "");
        setIcon(profile?.icon ?? "Briefcase");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, profile]
  );

  const SelectedIcon = getProfileIconComponent(icon);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Profile" : "Create Profile"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your profile name and icon."
              : "Create a profile to organize your conversations."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="stack-lg">
          {/* Name + icon trigger row */}
          <div className="stack-sm">
            <Label htmlFor="profile-name">Name</Label>
            <div className="flex items-center gap-3">
              {/* Icon trigger — opens picker popover above the dialog */}
              <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                <PopoverTrigger className="flex items-center justify-center size-10 rounded-lg border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer shrink-0">
                  {SelectedIcon ? (
                    <SelectedIcon className="size-5" weight="fill" />
                  ) : (
                    <span className="text-muted-foreground text-sm">?</span>
                  )}
                </PopoverTrigger>
                {/* Use raw Portal/Positioner with z-select (115) to sit above z-modal (110) */}
                <PopoverPortal>
                  <PopoverPositioner
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    className="z-select"
                  >
                    <PopoverPopup className="w-[300px] p-2 rounded-lg">
                      <ProfileIconPicker
                        selectedIcon={icon}
                        onSelect={iconName => {
                          setIcon(iconName);
                          setIconPickerOpen(false);
                        }}
                      />
                    </PopoverPopup>
                  </PopoverPositioner>
                </PopoverPortal>
              </Popover>
              <Input
                id="profile-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Work, Personal, Learning"
                maxLength={50}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {(() => {
                if (isPending) {
                  return isEditing ? "Saving..." : "Creating...";
                }
                return isEditing ? "Save" : "Create";
              })()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

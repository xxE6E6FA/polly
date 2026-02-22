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
import type { Profile, ProfileId } from "@/types";

type ProfileDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  otherProfiles: Profile[];
};

export function ProfileDeleteDialog({
  open,
  onOpenChange,
  profile,
  otherProfiles,
}: ProfileDeleteDialogProps) {
  const defaultProfile = otherProfiles.find(p => p.isDefault);
  const [moveTarget, setMoveTarget] = useState<ProfileId | "delete">(
    defaultProfile?._id ?? "delete"
  );
  const [isPending, startTransition] = useTransition();
  const removeProfile = useMutation(api.profiles.remove);

  const handleDelete = useCallback(() => {
    startTransition(async () => {
      await removeProfile({
        id: profile._id,
        moveConversationsToProfileId:
          moveTarget !== "delete" ? moveTarget : undefined,
      });
      onOpenChange(false);
    });
  }, [profile._id, moveTarget, removeProfile, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Delete "{profile.name}"?</DialogTitle>
          <DialogDescription>
            Choose what to do with conversations in this profile.
          </DialogDescription>
        </DialogHeader>

        <div className="stack-sm py-2">
          {otherProfiles.map(p => (
            <label
              key={p._id}
              className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="moveTarget"
                value={p._id}
                checked={moveTarget === p._id}
                onChange={() => setMoveTarget(p._id)}
                className="accent-primary"
              />
              <span className="text-sm">
                Move conversations to <strong>{p.name}</strong>
              </span>
            </label>
          ))}

          <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-destructive has-[:checked]:bg-destructive/5">
            <input
              type="radio"
              name="moveTarget"
              value="delete"
              checked={moveTarget === "delete"}
              onChange={() => setMoveTarget("delete")}
              className="accent-destructive"
            />
            <span className="text-sm text-destructive">
              Delete all conversations
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

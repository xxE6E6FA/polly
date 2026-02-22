import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { ProfileDeleteDialog } from "@/components/settings/profile-delete-dialog";
import { ProfileFormDialog } from "@/components/settings/profile-form-dialog";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfiles } from "@/hooks/use-profiles";
import { getProfileIconComponent } from "@/lib/profile-icons";
import type { Profile } from "@/types";

export default function ProfilesPage() {
  const { profiles, isLoading } = useProfiles();
  const [formOpen, setFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | undefined>();
  const [deletingProfile, setDeletingProfile] = useState<Profile | undefined>();

  const handleEdit = useCallback((profile: Profile) => {
    setEditingProfile(profile);
    setFormOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingProfile(undefined);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback((open: boolean) => {
    if (!open) {
      setEditingProfile(undefined);
    }
    setFormOpen(open);
  }, []);

  return (
    <SettingsPageLayout>
      <div className="flex items-start justify-between">
        <SettingsHeader
          title="Profiles"
          description="Organize conversations into separate contexts like work, personal, or learning."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          className="shrink-0"
        >
          <PlusIcon className="size-4 mr-1.5" />
          New Profile
        </Button>
      </div>

      {(() => {
        if (isLoading) {
          return (
            <div className="stack-sm">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          );
        }

        if (!profiles || profiles.length === 0) {
          return (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">
                No profiles yet. Create your first profile to organize
                conversations.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleCreate}
              >
                <PlusIcon className="size-4 mr-1.5" />
                Create Profile
              </Button>
            </div>
          );
        }

        return (
          <div className="stack-xs">
            {profiles.map(profile => {
              const IconComponent = getProfileIconComponent(profile.icon);
              return (
                <div
                  key={profile._id}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                    {IconComponent ? (
                      <IconComponent className="size-5 text-foreground/70" />
                    ) : (
                      <span className="text-sm text-muted-foreground">?</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {profile.name}
                      </span>
                      {profile.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          Default
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(profile)}
                      title="Edit profile"
                    >
                      <PencilSimpleIcon className="size-4" />
                    </Button>
                    {!profile.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingProfile(profile)}
                        title="Delete profile"
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      <ProfileFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        profile={editingProfile}
      />

      {deletingProfile && profiles && (
        <ProfileDeleteDialog
          open={!!deletingProfile}
          onOpenChange={open => {
            if (!open) {
              setDeletingProfile(undefined);
            }
          }}
          profile={deletingProfile}
          otherProfiles={profiles.filter(p => p._id !== deletingProfile._id)}
        />
      )}
    </SettingsPageLayout>
  );
}

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PersonaForm } from "@/components/settings/persona-form";
import { SettingsPageLayout } from "@/components/settings/ui";
import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { ROUTES } from "@/lib/routes";
import { isPersona } from "@/lib/type-guards";

type PersonaFormData = {
  name: string;
  description: string;
  prompt: string;
  icon: string;
};

type EmojiClickData = {
  emoji: string;
};

export default function EditPersonaPage() {
  const navigate = useNavigate();
  const { personaId } = useParams();
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [formData, setFormData] = useState<PersonaFormData | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const updatePersonaMutation = useMutation(api.personas.update);
  const deletePersonaMutation = useMutation(api.personas.remove);

  const personaRaw = usePersistentConvexQuery(
    "edit-persona-data",
    api.personas.get,
    personaId ? { id: personaId } : "skip"
  );

  const persona = isPersona(personaRaw) ? personaRaw : null;
  const isLoading = isUpdating || isDeleting;

  useEffect(() => {
    if (persona) {
      const data = {
        name: persona.name,
        description: persona.description || "",
        prompt: persona.prompt,
        icon: persona.icon || "🤖",
      };
      setFormData(data);
    }
  }, [persona]);

  if (!personaId) {
    return <NotFoundPage />;
  }

  const handleUpdatePersona = async () => {
    if (!(formData?.name.trim() && formData?.prompt.trim() && personaId)) {
      return;
    }

    setIsUpdating(true);
    try {
      await updatePersonaMutation({
        id: personaId as Id<"personas">,
        name: formData.name,
        description: formData.description,
        prompt: formData.prompt,
        icon: formData.icon,
      });
      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to update persona:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePersona = async () => {
    if (!personaId) {
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this persona? This action cannot be undone."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await deletePersonaMutation({ id: personaId as Id<"personas"> });
      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to delete persona:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setFormData(prev => (prev ? { ...prev, icon: emojiData.emoji } : null));
    setIsEmojiPickerOpen(false);
  };

  if (!persona && persona !== undefined) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Persona not found</h1>
          <Button asChild>
            <Link to={ROUTES.SETTINGS.PERSONAS}>Back to Personas</Link>
          </Button>
        </div>
      </SettingsPageLayout>
    );
  }

  if (!(persona && formData)) {
    return null;
  }

  const isFormValid = formData.name.trim() && formData.prompt.trim();

  return (
    <SettingsPageLayout>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Persona</h1>
        <p className="text-muted-foreground">
          Update your AI assistant&apos;s personality and instructions
        </p>
      </div>

      <PersonaForm
        formData={formData}
        handleEmojiClick={handleEmojiClick}
        isEmojiPickerOpen={isEmojiPickerOpen}
        setFormData={setFormData}
        setIsEmojiPickerOpen={setIsEmojiPickerOpen}
      />

      <div className="flex justify-between border-t pt-4">
        <Button
          disabled={isLoading}
          size="default"
          variant="destructive"
          onClick={handleDeletePersona}
        >
          {isDeleting ? "Deleting..." : "Delete Persona"}
        </Button>
        <div className="flex gap-3">
          <Button asChild disabled={isLoading} size="default" variant="outline">
            <Link to={ROUTES.SETTINGS.PERSONAS}>Cancel</Link>
          </Button>
          <Button
            disabled={!isFormValid || isLoading}
            size="default"
            variant="default"
            onClick={handleUpdatePersona}
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </SettingsPageLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { EmojiClickData } from "emoji-picker-react";
import {
  PersonaForm,
  PersonaFormData,
} from "@/components/settings/persona-form";
import { useNavigationBlocker } from "@/hooks/use-navigation-blocker";
import { ROUTES } from "@/lib/routes";

export default function EditPersonaPage() {
  const navigate = useNavigate();
  const params = useParams();
  const personaId = params.id;

  const persona = useQuery(
    api.personas.get,
    personaId ? { id: personaId as Id<"personas"> } : "skip"
  );
  const updatePersona = useMutation(api.personas.update);
  const deletePersona = useMutation(api.personas.remove);

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUpdated, setHasUpdated] = useState(false);

  const [formData, setFormData] = useState<PersonaFormData>({
    name: "",
    description: "",
    prompt: "",
    icon: "🤖",
  });

  const [initialFormData, setInitialFormData] =
    useState<PersonaFormData | null>(null);

  useEffect(() => {
    if (persona) {
      const data = {
        name: persona.name,
        description: persona.description || "",
        prompt: persona.prompt,
        icon: persona.icon || "🤖",
      };
      setFormData(data);
      setInitialFormData(data);
    }
  }, [persona]);

  // Check if form has been modified
  const hasUnsavedChanges = useMemo(() => {
    if (hasUpdated || !initialFormData) return false;
    return (
      formData.name !== initialFormData.name ||
      formData.description !== initialFormData.description ||
      formData.prompt !== initialFormData.prompt ||
      formData.icon !== initialFormData.icon
    );
  }, [formData, initialFormData, hasUpdated]);

  // Block navigation when there are unsaved changes
  useNavigationBlocker({
    when: hasUnsavedChanges,
    message:
      "You have unsaved changes to your persona. Are you sure you want to leave?",
  });

  const handleUpdatePersona = async () => {
    if (!formData.name.trim() || !formData.prompt.trim() || !personaId) {
      return;
    }

    setIsLoading(true);
    try {
      await updatePersona({
        id: personaId as Id<"personas">,
        name: formData.name,
        description: formData.description,
        prompt: formData.prompt,
        icon: formData.icon,
      });

      setHasUpdated(true);
      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to update persona:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePersona = async () => {
    if (!personaId) return;

    if (
      !window.confirm(
        "Are you sure you want to delete this persona? This action cannot be undone."
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      await deletePersona({ id: personaId as Id<"personas"> });
      setHasUpdated(true);
      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to delete persona:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setFormData(prev => ({ ...prev, icon: emojiData.emoji }));
    setIsEmojiPickerOpen(false);
  };

  if (!persona && persona !== undefined) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Persona not found</h1>
        <Button onClick={() => navigate(ROUTES.SETTINGS.PERSONAS)}>
          Back to Personas
        </Button>
      </div>
    );
  }

  if (!persona) {
    return <div>Loading...</div>;
  }

  const isFormValid = formData.name.trim() && formData.prompt.trim();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Persona</h1>
        <p className="text-muted-foreground">
          Update your AI assistant&apos;s personality and instructions
        </p>
      </div>

      <PersonaForm
        formData={formData}
        setFormData={setFormData}
        isEmojiPickerOpen={isEmojiPickerOpen}
        setIsEmojiPickerOpen={setIsEmojiPickerOpen}
        handleEmojiClick={handleEmojiClick}
      />

      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="destructive"
          size="default"
          onClick={handleDeletePersona}
          disabled={isLoading}
        >
          Delete Persona
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="default"
            onClick={() => navigate(ROUTES.SETTINGS.PERSONAS)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="default"
            onClick={handleUpdatePersona}
            disabled={!isFormValid || isLoading || !hasUnsavedChanges}
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

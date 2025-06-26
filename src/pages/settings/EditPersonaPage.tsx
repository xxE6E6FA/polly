import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router";

import { useMutation, useQuery } from "convex/react";
import { type EmojiClickData } from "emoji-picker-react";

import { api } from "convex/_generated/api";
import { type Id } from "convex/_generated/dataModel";

import {
  PersonaForm,
  type PersonaFormData,
} from "@/components/settings/persona-form";
import { Button } from "@/components/ui/button";
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

  const [formData, setFormData] = useState<PersonaFormData | null>(null);

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

  const handleUpdatePersona = async () => {
    if (!formData?.name.trim() || !formData?.prompt.trim() || !personaId) {
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

      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to update persona:", error);
    } finally {
      setIsLoading(false);
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

    setIsLoading(true);
    try {
      await deletePersona({ id: personaId as Id<"personas"> });
      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to delete persona:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setFormData(prev => (prev ? { ...prev, icon: emojiData.emoji } : null));
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

  if (!persona || !formData) {
    return null;
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
          Delete Persona
        </Button>
        <div className="flex gap-3">
          <Button
            disabled={isLoading}
            size="default"
            variant="outline"
            onClick={() => navigate(ROUTES.SETTINGS.PERSONAS)}
          >
            Cancel
          </Button>
          <Button
            disabled={!isFormValid || isLoading}
            size="default"
            variant="default"
            onClick={handleUpdatePersona}
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

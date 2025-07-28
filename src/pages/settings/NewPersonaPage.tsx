import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import type { EmojiClickData } from "emoji-picker-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  PersonaForm,
  type PersonaFormData,
} from "@/components/settings/persona-form";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

export default function NewPersonaPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  const [formData, setFormData] = useState<PersonaFormData>({
    name: "",
    description: "",
    prompt: "",
    icon: "🤖",
  });

  const createPersonaMutation = useMutation(api.personas.create);

  const handleCreatePersona = async () => {
    if (!(formData.name.trim() && formData.prompt.trim())) {
      return;
    }

    setIsLoading(true);
    try {
      await createPersonaMutation({
        name: formData.name,
        description: formData.description,
        prompt: formData.prompt,
        icon: formData.icon,
      });
      navigate(ROUTES.SETTINGS.PERSONAS);
    } catch (error) {
      console.error("Failed to create persona:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setFormData(prev => ({ ...prev, icon: emojiData.emoji }));
    setIsEmojiPickerOpen(false);
  };

  const isFormValid = formData.name.trim() && formData.prompt.trim();

  return (
    <SettingsPageLayout>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create New Persona
        </h1>
        <p className="text-muted-foreground">
          Give your AI assistant a unique personality and style for different
          types of conversations
        </p>
      </div>

      <PersonaForm
        formData={formData}
        handleEmojiClick={handleEmojiClick}
        isEmojiPickerOpen={isEmojiPickerOpen}
        setFormData={
          setFormData as React.Dispatch<
            React.SetStateAction<PersonaFormData | null>
          >
        }
        setIsEmojiPickerOpen={setIsEmojiPickerOpen}
      />

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button asChild disabled={isLoading} size="default" variant="outline">
          <Link to={ROUTES.SETTINGS.PERSONAS}>Cancel</Link>
        </Button>
        <Button
          disabled={!isFormValid || isLoading}
          size="default"
          variant="default"
          onClick={handleCreatePersona}
        >
          {isLoading ? "Creating..." : "Create Persona"}
        </Button>
      </div>
    </SettingsPageLayout>
  );
}

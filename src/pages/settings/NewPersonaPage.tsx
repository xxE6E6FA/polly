import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useMutation } from "convex/react";
import { EmojiClickData } from "emoji-picker-react";
import {
  PersonaForm,
  PersonaFormData,
} from "@/components/settings/persona-form";
import { api } from "convex/_generated/api";
import { useNavigationBlocker } from "@/hooks/use-navigation-blocker";
import { ROUTES } from "@/lib/routes";

export default function NewPersonaPage() {
  const navigate = useNavigate();
  const createPersona = useMutation(api.personas.create);

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasCreated, setHasCreated] = useState(false);

  const [formData, setFormData] = useState<PersonaFormData>({
    name: "",
    description: "",
    prompt: "",
    icon: "🤖",
  });

  // Check if form has been modified
  const hasUnsavedChanges = useMemo(() => {
    if (hasCreated) return false;
    return (
      formData.name.trim() !== "" ||
      formData.description.trim() !== "" ||
      formData.prompt.trim() !== "" ||
      formData.icon !== "🤖"
    );
  }, [formData, hasCreated]);

  // Block navigation when there are unsaved changes
  useNavigationBlocker({
    when: hasUnsavedChanges,
    message:
      "You have unsaved changes to your persona. Are you sure you want to leave?",
  });

  const handleCreatePersona = async () => {
    if (!formData.name.trim() || !formData.prompt.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      await createPersona({
        name: formData.name,
        description: formData.description,
        prompt: formData.prompt,
        icon: formData.icon,
      });

      setHasCreated(true);
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
    <div className="space-y-8">
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
        setFormData={setFormData}
        isEmojiPickerOpen={isEmojiPickerOpen}
        setIsEmojiPickerOpen={setIsEmojiPickerOpen}
        handleEmojiClick={handleEmojiClick}
      />

      <div className="flex justify-end gap-3 pt-4 border-t">
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
          onClick={handleCreatePersona}
          disabled={!isFormValid || isLoading}
        >
          {isLoading ? "Creating..." : "Create Persona"}
        </Button>
      </div>
    </div>
  );
}

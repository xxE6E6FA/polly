import { api } from "convex/_generated/api";
import type { EmojiClickData } from "emoji-picker-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import {
  PersonaForm,
  type PersonaFormData,
} from "@/components/settings/persona-form";
import { Button } from "@/components/ui/button";
import { useConvexMutationWithCache } from "@/hooks/use-convex-cache";
import { ROUTES } from "@/lib/routes";

export default function NewPersonaPage() {
  const navigate = useNavigate();

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  const [formData, setFormData] = useState<PersonaFormData>({
    name: "",
    description: "",
    prompt: "",
    icon: "🤖",
  });

  // Use optimized mutation hook
  const { mutateAsync: createPersona, isLoading } = useConvexMutationWithCache(
    api.personas.create,
    {
      onSuccess: () => {
        navigate(ROUTES.SETTINGS.PERSONAS);
      },
      onError: (error: Error) => {
        console.error("Failed to create persona:", error);
      },
      invalidateQueries: ["personas"],
      invalidationEvents: ["personas-changed"],
    }
  );

  const handleCreatePersona = async () => {
    if (!(formData.name.trim() && formData.prompt.trim())) {
      return;
    }

    await createPersona({
      name: formData.name,
      description: formData.description,
      prompt: formData.prompt,
      icon: formData.icon,
    });
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
          onClick={handleCreatePersona}
        >
          {isLoading ? "Creating..." : "Create Persona"}
        </Button>
      </div>
    </div>
  );
}

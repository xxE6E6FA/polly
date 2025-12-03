import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useState, useTransition } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PersonaForm,
  type PersonaFormData,
} from "@/components/settings/persona-form";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { useToast } from "@/providers/toast-context";

export default function NewPersonaPage() {
  const navigate = useNavigate();
  const managedToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  const [formData, setFormData] = useState<PersonaFormData>({
    name: "",
    description: "",
    prompt: "",
    icon: "🤖",
    ttsVoiceId: undefined,
    advancedSamplingEnabled: false,
  });

  const createPersonaMutation = useMutation(api.personas.create);

  const handleCreatePersona = () => {
    if (!(formData.name.trim() && formData.prompt.trim())) {
      return;
    }

    startTransition(async () => {
      try {
        await createPersonaMutation({
          name: formData.name,
          description: formData.description,
          prompt: formData.prompt,
          icon: formData.icon,
          ttsVoiceId: formData.ttsVoiceId || undefined,
          temperature: formData.temperature,
          topP: formData.topP,
          topK: formData.topK,
          frequencyPenalty: formData.frequencyPenalty,
          presencePenalty: formData.presencePenalty,
          repetitionPenalty: formData.repetitionPenalty,
          advancedSamplingEnabled: formData.advancedSamplingEnabled,
        });
        navigate(ROUTES.SETTINGS.PERSONAS);
      } catch (_error) {
        managedToast.error("Failed to create persona");
      }
    });
  };

  const handleEmojiClick = (emoji: string) => {
    setFormData(prev => ({ ...prev, icon: emoji }));
    setIsEmojiPickerOpen(false);
  };

  const isFormValid = formData.name.trim() && formData.prompt.trim();

  return (
    <SettingsPageLayout>
      <div className="stack-sm">
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
        <Link
          to={ROUTES.SETTINGS.PERSONAS}
          className={buttonVariants({ size: "default", variant: "outline" })}
        >
          Cancel
        </Link>
        <Button
          disabled={!isFormValid || isPending}
          size="default"
          variant="default"
          onClick={handleCreatePersona}
        >
          {isPending ? "Creating..." : "Create Persona"}
        </Button>
      </div>
    </SettingsPageLayout>
  );
}

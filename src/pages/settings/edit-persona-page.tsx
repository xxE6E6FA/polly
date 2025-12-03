import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, useTransition } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PersonaForm,
  type PersonaFormData,
} from "@/components/settings/persona-form";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { ROUTES } from "@/lib/routes";
import { isPersona } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";

// Using shared PersonaFormData type from PersonaForm

export default function EditPersonaPage() {
  const navigate = useNavigate();
  const { id: personaId } = useParams();
  const managedToast = useToast();
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [formData, setFormData] = useState<PersonaFormData | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const updatePersonaMutation = useMutation(api.personas.update);
  const deletePersonaMutation = useMutation(api.personas.remove);

  const personaRaw = useQuery(
    api.personas.get,
    personaId ? { id: personaId as Id<"personas"> } : "skip"
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
        ttsVoiceId: (persona as unknown as { ttsVoiceId?: string }).ttsVoiceId,
        temperature: (persona as unknown as { temperature?: number })
          .temperature,
        topP: (persona as unknown as { topP?: number }).topP,
        topK: (persona as unknown as { topK?: number }).topK,
        frequencyPenalty: (persona as unknown as { frequencyPenalty?: number })
          .frequencyPenalty,
        presencePenalty: (persona as unknown as { presencePenalty?: number })
          .presencePenalty,
        repetitionPenalty: (
          persona as unknown as { repetitionPenalty?: number }
        ).repetitionPenalty,
        advancedSamplingEnabled: (
          persona as unknown as { advancedSamplingEnabled?: boolean }
        ).advancedSamplingEnabled,
      };
      setFormData(data);
    }
  }, [persona]);

  if (!personaId) {
    return <NotFoundPage />;
  }

  const handleUpdatePersona = () => {
    if (!(formData?.name.trim() && formData?.prompt.trim() && personaId)) {
      return;
    }

    startUpdateTransition(async () => {
      try {
        await updatePersonaMutation({
          id: personaId as Id<"personas">,
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
        managedToast.error("Failed to update persona");
      }
    });
  };

  const handleDeletePersona = () => {
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

    startDeleteTransition(async () => {
      try {
        await deletePersonaMutation({ id: personaId as Id<"personas"> });
        navigate(ROUTES.SETTINGS.PERSONAS);
      } catch (_error) {
        managedToast.error("Failed to delete persona");
      }
    });
  };

  const handleEmojiClick = (emoji: string) => {
    setFormData(prev => (prev ? { ...prev, icon: emoji } : null));
    setIsEmojiPickerOpen(false);
  };

  if (!persona && persona !== undefined) {
    return (
      <SettingsPageLayout>
        <div className="stack-xl">
          <h1 className="text-2xl font-semibold">Persona not found</h1>
          <Link to={ROUTES.SETTINGS.PERSONAS} className={buttonVariants()}>
            Back to Personas
          </Link>
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
      <div className="stack-sm">
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
          <Link
            to={ROUTES.SETTINGS.PERSONAS}
            className={buttonVariants({ size: "default", variant: "outline" })}
          >
            Cancel
          </Link>
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

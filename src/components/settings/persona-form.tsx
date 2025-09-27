import { api } from "@convex/_generated/api";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowsOutIcon,
  SmileyIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { EmojiPickerDrawer } from "@/components/ui/emoji-picker-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SkeletonText } from "@/components/ui/skeleton-text";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isApiKeysArray } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import { VoicePicker } from "./models-tab/VoicePicker";
import { useWordBasedUndo } from "./use-word-based-undo";

export type PersonaFormData = {
  name: string;
  description: string;
  prompt: string;
  icon: string;
  ttsVoiceId?: string;
  // Advanced sampling parameters (optional)
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  // Whether advanced sampling is enabled
  advancedSamplingEnabled?: boolean;
};

type PersonaFormProps = {
  formData: PersonaFormData;
  setFormData: React.Dispatch<React.SetStateAction<PersonaFormData | null>>;
  isEmojiPickerOpen: boolean;
  setIsEmojiPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleEmojiClick: (emoji: string) => void;
};

// Clean emoji picker using shadcn component
const SimpleEmojiPicker = ({
  onEmojiSelect,
  onClose,
}: {
  onEmojiSelect: (emoji: string) => void;
  onClose?: () => void;
}) => {
  return (
    <EmojiPicker
      className="h-96 w-80 border shadow-sm"
      onClose={onClose}
      onEmojiSelect={({ emoji }: { emoji: string }) => {
        onEmojiSelect(emoji);
        onClose?.();
      }}
    >
      <EmojiPickerSearch placeholder="Search emojis..." />
      <EmojiPickerContent />
      <EmojiPickerFooter />
    </EmojiPicker>
  );
};

export const PersonaForm = ({
  formData,
  setFormData,
  isEmojiPickerOpen,
  setIsEmojiPickerOpen,
  handleEmojiClick,
}: PersonaFormProps) => {
  const [isFullScreenEditor, setIsFullScreenEditor] = useState(false);
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(() => {
    // Show by default if any advanced params are set or if advanced sampling is enabled
    return (
      formData.advancedSamplingEnabled === true ||
      formData.temperature !== undefined ||
      formData.topP !== undefined ||
      formData.topK !== undefined ||
      formData.frequencyPenalty !== undefined ||
      formData.presencePenalty !== undefined ||
      formData.repetitionPenalty !== undefined
    );
  });

  // Sync the UI state with the form data
  useEffect(() => {
    if (formData.advancedSamplingEnabled !== undefined) {
      setShowAdvanced(formData.advancedSamplingEnabled);
    }
  }, [formData.advancedSamplingEnabled]);
  const managedToast = useToast();
  const improvePromptAction = useAction(api.personas.improvePrompt);
  const suggestSamplingAction = useAction(api.personas.suggestSampling);

  // Check if user has ElevenLabs API key to show TTS section
  const { user } = useUserDataContext();
  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    user && !user.isAnonymous ? {} : "skip"
  );
  const apiKeys = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
  const hasElevenLabs = useMemo(() => {
    return apiKeys.some(k => {
      if (k.provider !== "elevenlabs") {
        return false;
      }
      const obj = k as unknown as Record<string, unknown>;
      if ("hasKey" in obj && typeof obj.hasKey === "boolean") {
        return obj.hasKey as boolean;
      }
      if ("encryptedKey" in obj && obj.encryptedKey !== undefined) {
        return true;
      }
      if ("clientEncryptedKey" in obj && obj.clientEncryptedKey !== undefined) {
        return true;
      }
      return false;
    });
  }, [apiKeys]);

  const updateFormField = useCallback(
    <K extends keyof PersonaFormData>(field: K, value: PersonaFormData[K]) => {
      setFormData(prev => (prev ? { ...prev, [field]: value } : null));
    },
    [setFormData]
  );

  // Handle advanced sampling toggle
  const handleAdvancedSamplingToggle = useCallback(
    (enabled: boolean) => {
      setShowAdvanced(enabled);
      updateFormField("advancedSamplingEnabled", enabled);

      // If disabling, clear all advanced parameters
      if (!enabled) {
        setFormData(prev =>
          prev
            ? {
                ...prev,
                temperature: undefined,
                topP: undefined,
                topK: undefined,
                frequencyPenalty: undefined,
                presencePenalty: undefined,
                repetitionPenalty: undefined,
                advancedSamplingEnabled: false,
              }
            : null
        );
      }
    },
    [updateFormField, setFormData]
  );

  const {
    value: promptValue,
    updateValue: setPromptValue,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useWordBasedUndo({
    initialValue: formData.prompt,
    debounceMs: 1000,
  });

  const handlePromptChange = useCallback(
    (newValue: string) => {
      setPromptValue(newValue);
      updateFormField("prompt", newValue);
    },
    [setPromptValue, updateFormField]
  );

  const handleImprovePrompt = useCallback(async () => {
    if (!promptValue.trim()) {
      managedToast.error("No prompt to improve", {
        description: "Please enter a prompt first before trying to improve it.",
      });
      return;
    }

    setIsImprovingPrompt(true);
    try {
      const result = await improvePromptAction({ prompt: promptValue });
      if (result.improvedPrompt) {
        handlePromptChange(result.improvedPrompt);
        managedToast.success("Prompt improved!", {
          description: "Your prompt has been enhanced with AI suggestions.",
        });
      }
    } catch (_error) {
      managedToast.error("Failed to improve prompt", {
        description: "Unable to improve the prompt. Please try again.",
      });
    } finally {
      setIsImprovingPrompt(false);
    }
  }, [
    promptValue,
    improvePromptAction,
    handlePromptChange,
    managedToast.success,
    managedToast.error,
  ]);

  const handleAutoTuneClick = useCallback(async () => {
    if (!promptValue.trim()) {
      managedToast.error("Please enter a system prompt first");
      return;
    }
    const toastId = managedToast.loading("Tuning parameters...");
    try {
      const suggestion = await suggestSamplingAction({
        systemPrompt: promptValue,
      });
      setShowAdvanced(true);
      setFormData(prev =>
        prev
          ? {
              ...prev,
              advancedSamplingEnabled: true,
              temperature: suggestion.temperature ?? prev.temperature,
              topP: suggestion.topP ?? prev.topP,
              topK: suggestion.topK ?? prev.topK,
              frequencyPenalty:
                suggestion.frequencyPenalty ?? prev.frequencyPenalty,
              presencePenalty:
                suggestion.presencePenalty ?? prev.presencePenalty,
              repetitionPenalty:
                suggestion.repetitionPenalty ?? prev.repetitionPenalty,
            }
          : prev
      );
      managedToast.success("Parameters updated", {
        id: String(toastId),
        description: "Applied tuned sampling parameters.",
      });
    } catch (_e) {
      managedToast.error("Failed to tune parameters", {
        id: String(toastId),
      });
    }
  }, [
    promptValue,
    suggestSamplingAction,
    setFormData,
    managedToast.error,
    managedToast.loading,
    managedToast.success,
  ]);

  return (
    <div className="stack-xl">
      {/* Basic Information + Icon (responsive grid) */}
      <div className="stack-lg">
        <h2 className="mb-2 text-xl font-semibold">Basic Information</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Name & Description */}
          <div className="stack-lg">
            <div className="stack-sm">
              <Label className="text-sm font-medium" htmlFor="name">
                Name
              </Label>
              <Input
                className="h-10"
                id="name"
                placeholder="e.g., Creative Writer"
                value={formData.name}
                onChange={e => updateFormField("name", e.target.value)}
              />
            </div>

            <div className="stack-sm">
              <Label className="text-sm font-medium" htmlFor="description">
                Description{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                className="h-10"
                id="description"
                placeholder="e.g., Imaginative storyteller and creative writing assistant"
                value={formData.description}
                onChange={e => updateFormField("description", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-muted/30 p-4 ring-1 ring-border/30 shadow-sm">
            <div className="relative h-16 w-16 overflow-hidden rounded-xl border-2 bg-background shadow-sm">
              <span
                className="absolute select-none text-3xl"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  lineHeight: 1,
                  fontFamily:
                    "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
                }}
              >
                {formData.icon}
              </span>
            </div>
            <div className="flex-1">
              <p className="mb-3 text-sm text-muted-foreground">
                Choose an emoji to represent your persona
              </p>

              {/* Desktop/Tablet: Popover */}
              <div className="hidden sm:block">
                <Popover
                  open={isEmojiPickerOpen}
                  onOpenChange={setIsEmojiPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button size="default" variant="outline">
                      <SmileyIcon className="mr-2 h-4 w-4" />
                      Choose Emoji
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <SimpleEmojiPicker
                      onEmojiSelect={handleEmojiClick}
                      onClose={() => setIsEmojiPickerOpen(false)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Mobile: Drawer */}
              <div className="block sm:hidden">
                <EmojiPickerDrawer onEmojiSelect={handleEmojiClick}>
                  <Button size="default" variant="outline">
                    <SmileyIcon className="mr-2 h-4 w-4" />
                    Choose Emoji
                  </Button>
                </EmojiPickerDrawer>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Personality & Instructions */}
      <div className="stack-md">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Personality & Instructions</h2>
          <Button
            className="gap-2"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setIsFullScreenEditor(true)}
          >
            <ArrowsOutIcon className="h-4 w-4" />
            Fullscreen Editor
          </Button>
        </div>
        <div className="stack-md">
          <div className="group relative rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              className="min-h-[300px] resize-none rounded-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-base"
              id="prompt"
              placeholder="Describe how you want your AI assistant to behave and respond. For example: 'You are a creative writing assistant who helps users brainstorm ideas, develop characters, and craft compelling stories. Be encouraging, imaginative, and offer specific suggestions.'"
              rows={12}
              value={promptValue}
              onChange={e => handlePromptChange(e.target.value)}
            />

            {isImprovingPrompt && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background">
                <div className="relative h-full w-full overflow-hidden">
                  <SkeletonText className="absolute inset-0 opacity-80" />
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-background/50 to-transparent" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform text-center">
                    <div className="inline-flex items-center gap-2 rounded-full ring-1 ring-border/40 bg-background px-3 py-1.5 shadow-sm">
                      <Spinner size="sm" />
                      <span className="text-sm font-medium text-muted-foreground">
                        Improving prompt…
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Prompt Controls */}
            <div className="flex items-center justify-between gap-2 border-t border-border/30 bg-muted/30 p-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    className="h-7 w-7 p-0"
                    disabled={!canUndo || isImprovingPrompt}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={undo}
                  >
                    <ArrowCounterClockwiseIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    className="h-7 w-7 p-0"
                    disabled={!canRedo || isImprovingPrompt}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={redo}
                  >
                    <ArrowClockwiseIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Button
                className="gap-2 text-xs"
                disabled={!promptValue.trim() || isImprovingPrompt}
                size="sm"
                type="button"
                variant="outline"
                onClick={handleImprovePrompt}
              >
                {isImprovingPrompt ? (
                  <>
                    <Spinner size="sm" />
                    Improving...
                  </>
                ) : (
                  <>
                    <SparkleIcon className="h-3.5 w-3.5" />
                    Improve prompt
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Define your assistant&apos;s personality, tone, and expertise. This
            guides how it will respond in conversations. Use the{" "}
            <Button
              className="h-auto p-0 text-xs text-blue-500 underline hover:text-blue-600"
              disabled={!promptValue.trim() || isImprovingPrompt}
              size="sm"
              type="button"
              variant="link"
              onClick={handleImprovePrompt}
            >
              improve prompt
            </Button>{" "}
            feature to transform simple ideas into structured prompts. Need more
            help?{" "}
            <a
              className="text-blue-500 underline transition-colors hover:text-blue-600"
              href="https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts"
              rel="noopener noreferrer"
              target="_blank"
            >
              Check out this system prompts guide
            </a>{" "}
            for tips and best practices.
          </p>
        </div>
      </div>
      {/* Advanced Sampling Options */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Advanced sampling options</h3>
          <p className="text-xs text-muted-foreground">
            Control decoding behavior. These apply when using this persona.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleAutoTuneClick}>
            Auto-tune for this prompt
          </Button>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Enable</Label>
            <Switch
              checked={showAdvanced}
              onCheckedChange={handleAdvancedSamplingToggle}
            />
          </div>
        </div>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Temperature */}
          <div className="stack-sm">
            <Label className="text-sm font-medium">Temperature</Label>
            <div className="text-xs text-muted-foreground">
              0 = deterministic, 2 = highly creative
            </div>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={formData.temperature ?? ""}
              onChange={e =>
                updateFormField(
                  "temperature",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            />
          </div>
          {/* top_p */}
          <div className="stack-sm">
            <Label className="text-sm font-medium">Top P</Label>
            <div className="text-xs text-muted-foreground">
              0-1 nucleus sampling
            </div>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={formData.topP ?? ""}
              onChange={e =>
                updateFormField(
                  "topP",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            />
          </div>
          {/* top_k */}
          <div className="stack-sm">
            <Label className="text-sm font-medium">Top K</Label>
            <div className="text-xs text-muted-foreground">
              0-100+ (provider dependent)
            </div>
            <Input
              type="number"
              min={0}
              step={1}
              value={formData.topK ?? ""}
              onChange={e =>
                updateFormField(
                  "topK",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            />
          </div>
          {/* frequency penalty */}
          <div className="stack-sm">
            <Label className="text-sm font-medium">Frequency Penalty</Label>
            <div className="text-xs text-muted-foreground">
              Discourage repeated tokens
            </div>
            <Input
              type="number"
              step={0.1}
              value={formData.frequencyPenalty ?? ""}
              onChange={e =>
                updateFormField(
                  "frequencyPenalty",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            />
          </div>
          {/* presence penalty */}
          <div className="stack-sm">
            <Label className="text-sm font-medium">Presence Penalty</Label>
            <div className="text-xs text-muted-foreground">
              Encourage new topics
            </div>
            <Input
              type="number"
              step={0.1}
              value={formData.presencePenalty ?? ""}
              onChange={e =>
                updateFormField(
                  "presencePenalty",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            />
          </div>
          {/* repetition penalty */}
          <div className="stack-sm">
            <Label className="text-sm font-medium">Repetition Penalty</Label>
            <div className="text-xs text-muted-foreground">
              {">"}1 penalizes repetition
            </div>
            <Input
              type="number"
              step={0.1}
              value={formData.repetitionPenalty ?? ""}
              onChange={e =>
                updateFormField(
                  "repetitionPenalty",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            />
          </div>
        </div>
      )}

      {showAdvanced && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <div className="text-amber-600 dark:text-amber-400">⚠️</div>
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Provider Compatibility Note
              </p>
              <p className="text-amber-700 dark:text-amber-300">
                Not all AI providers support every parameter. Unsupported
                parameters will be automatically filtered out to prevent errors.
              </p>
            </div>
          </div>
        </div>
      )}
      {hasElevenLabs && (
        <div className="stack-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Text-to-speech</h3>
              <p className="text-xs text-muted-foreground">
                Override the default ElevenLabs voice for this persona
              </p>
            </div>
          </div>
          <div className="stack-sm">
            <VoicePicker
              value={formData.ttsVoiceId}
              onChange={id =>
                updateFormField(
                  "ttsVoiceId",
                  (id || undefined) as unknown as string | undefined
                )
              }
              includeDefaultItem
              defaultLabel="Default (from Settings)"
            />
          </div>
        </div>
      )}
      {isFullScreenEditor && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Header */}
          <div className="flex flex-shrink-0 flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-start sm:gap-4">
              <h2 className="truncate text-lg font-semibold">
                <span className="hidden sm:inline">
                  Personality & Instructions
                </span>
                <span className="sm:hidden">Edit Prompt</span>
              </h2>
              <Button
                className="h-8 w-8 flex-shrink-0 p-0 sm:hidden"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setIsFullScreenEditor(false)}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-4">
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-1 sm:flex">
                  <Button
                    className="h-8 w-8 p-0"
                    disabled={!canUndo || isImprovingPrompt}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={undo}
                  >
                    <ArrowCounterClockwiseIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-8 w-8 p-0"
                    disabled={!canRedo || isImprovingPrompt}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={redo}
                  >
                    <ArrowClockwiseIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  className="gap-1 sm:gap-2"
                  disabled={!promptValue.trim() || isImprovingPrompt}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={handleImprovePrompt}
                >
                  {isImprovingPrompt ? (
                    <>
                      <Spinner size="sm" />
                      <span className="xs:inline hidden">Improving...</span>
                      <span className="xs:hidden">...</span>
                    </>
                  ) : (
                    <>
                      <SparkleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="xs:inline hidden">Improve prompt</span>
                      <span className="xs:hidden">Improve</span>
                    </>
                  )}
                </Button>
                <Button
                  className="hidden h-8 w-8 flex-shrink-0 p-0 sm:flex"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setIsFullScreenEditor(false)}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="relative min-h-0 flex-1">
            <Textarea
              className="h-full w-full resize-none overflow-y-auto border-0 bg-transparent p-4 pl-[max(1rem,calc(50%-40ch))] pr-[max(1rem,calc(50%-40ch))] font-mono text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 sm:p-6 sm:pl-[max(1.5rem,calc(50%-40ch))] sm:pr-[max(1.5rem,calc(50%-40ch))] sm:text-base lg:p-8 lg:pl-[max(2rem,calc(50%-40ch))] lg:pr-[max(2rem,calc(50%-40ch))]"
              placeholder="Describe how you want your AI assistant to behave and respond..."
              onChange={e => handlePromptChange(e.target.value)}
            >
              {promptValue}
            </Textarea>

            {isImprovingPrompt && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background">
                <div className="relative h-full w-full overflow-hidden px-8">
                  <div
                    className="absolute top-1/2 h-64 -translate-y-1/2 transform opacity-80"
                    style={{
                      left: "max(2rem, calc(50% - 40ch))",
                      right: "max(2rem, calc(50% - 40ch))",
                    }}
                  >
                    <SkeletonText className="h-full" />
                  </div>
                  <div
                    className="absolute top-1/2 h-64 -translate-y-1/2 transform animate-pulse bg-gradient-to-br from-transparent via-background/50 to-transparent"
                    style={{
                      left: "max(2rem, calc(50% - 40ch))",
                      right: "max(2rem, calc(50% - 40ch))",
                    }}
                  />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform text-center">
                    <div className="inline-flex items-center gap-2 rounded-full ring-1 ring-border/40 bg-background px-3 py-1.5 shadow-sm">
                      <Spinner size="sm" />
                      <span className="text-sm font-medium text-muted-foreground">
                        Improving prompt…
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

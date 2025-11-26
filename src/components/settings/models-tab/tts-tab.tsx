import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUserSettings } from "@/hooks/use-user-settings";
import { isApiKeysArray } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import { ModelPicker } from "./model-picker";
import { VoicePicker } from "./voice-picker";

type ApiKeyInfo = {
  provider: string;
  hasKey?: boolean;
  encryptedKey?: unknown;
  clientEncryptedKey?: unknown;
};

export const TTSTab = () => {
  const userSettings = useUserSettings();
  const updateUserSettings = useMutation(api.userSettings.updateUserSettings);
  const { user } = useUserDataContext();
  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    user && !user.isAnonymous ? {} : "skip"
  );
  const apiKeys = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];

  const hasElevenLabs = useMemo(() => {
    const hasKey = (k: unknown): k is ApiKeyInfo => {
      if (k && typeof k === "object") {
        const obj = k as {
          hasKey?: boolean;
          encryptedKey?: unknown;
          clientEncryptedKey?: unknown;
        };
        if (typeof obj.hasKey === "boolean") {
          return obj.hasKey;
        }
        return Boolean(obj.encryptedKey || obj.clientEncryptedKey);
      }
      return false;
    };

    return apiKeys.filter(hasKey).some(key => key.provider === "elevenlabs");
  }, [apiKeys]);

  if (!(userSettings && hasElevenLabs)) {
    return null;
  }

  return (
    <div className="stack-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="stack-sm">
          <ModelPicker
            label="Model"
            value={userSettings.ttsModelId || "eleven_v3"}
            onChange={async v => {
              await updateUserSettings({ ttsModelId: v || undefined });
            }}
          />
        </div>
        <div className="stack-sm">
          <VoicePicker
            label="Voice"
            value={userSettings.ttsVoiceId}
            onChange={async v => {
              await updateUserSettings({ ttsVoiceId: v || undefined });
            }}
            includeDefaultItem
            defaultLabel="Default (no override)"
          />
          <p className="text-xs text-muted-foreground">
            Pick from your ElevenLabs voices
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="stack-sm">
          <Label>Stability</Label>
          <Select
            value={(userSettings.ttsStabilityMode || "creative") as string}
            onValueChange={async v => {
              await updateUserSettings({
                ttsStabilityMode: v as "creative" | "natural" | "robust",
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="creative">Creative</SelectItem>
              <SelectItem value="natural">Natural</SelectItem>
              <SelectItem value="robust">Robust</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="stack-xs">
          <Label>Enhanced TTS processing</Label>
          <p className="text-xs text-muted-foreground">
            Optimize text using ElevenLabs best practices: natural pauses,
            pronunciation guidance, and emotional context
          </p>
        </div>
        <Switch
          checked={userSettings.ttsUseAudioTags ?? true}
          onCheckedChange={async checked => {
            await updateUserSettings({ ttsUseAudioTags: checked });
          }}
        />
      </div>
    </div>
  );
};

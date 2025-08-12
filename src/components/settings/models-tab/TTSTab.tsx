import { api } from "@convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type ApiKeyInfo = {
  provider: string;
  hasKey?: boolean;
  encryptedKey?: unknown;
  clientEncryptedKey?: unknown;
};

export const TTSTab = () => {
  const userSettings = useUserSettings();
  const updateUserSettings = useMutation(api.userSettings.updateUserSettings);
  const fetchAllTTSDataAction = useAction(api.ai.elevenlabs.fetchAllTTSData);
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

  const [voiceOptions, setVoiceOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [modelOptions, setModelOptions] = useState<
    Array<{
      id: string;
      name: string;
      description?: string;
      recommended?: boolean;
      tier?: string;
    }>
  >([]);

  const renderModelOption = useCallback(
    (m: { id: string; name: string; description?: string }) => {
      return (
        <div className="flex flex-col gap-1" title={m.description || m.name}>
          <span className="font-medium">{m.name}</span>
          {m.description && (
            <span className="text-xs text-muted-foreground leading-relaxed">
              {m.description}
            </span>
          )}
        </div>
      );
    },
    []
  );

  const fetchAllTTSData = useCallback(async () => {
    if (!hasElevenLabs) {
      return;
    }

    const result = await fetchAllTTSDataAction({});
    setVoiceOptions(result.voices.map(v => ({ id: v.id, name: v.name })));
    setModelOptions(result.models);
  }, [fetchAllTTSDataAction, hasElevenLabs]);

  useEffect(() => {
    if (hasElevenLabs) {
      fetchAllTTSData();
    }
  }, [hasElevenLabs, fetchAllTTSData]);

  if (!userSettings) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Voice</Label>
          <Select
            value={userSettings.ttsVoiceId || ""}
            onValueChange={async v => {
              await updateUserSettings({ ttsVoiceId: v || undefined });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {voiceOptions.length > 0
                ? voiceOptions.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))
                : userSettings.ttsVoiceId && (
                    <SelectItem value={userSettings.ttsVoiceId}>
                      {userSettings.ttsVoiceId}
                    </SelectItem>
                  )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pick from your ElevenLabs voices
          </p>
        </div>
        <div className="space-y-1.5 max-w-[280px]">
          <Label>Model</Label>
          <Select
            value={userSettings.ttsModelId || "eleven_v3"}
            onValueChange={async v => {
              await updateUserSettings({ ttsModelId: v || undefined });
            }}
          >
            <SelectTrigger className="w-full text-left">
              <SelectValue placeholder="Select a model">
                {modelOptions.find(m => m.id === userSettings.ttsModelId)
                  ?.name || userSettings.ttsModelId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-w-[400px]">
              {modelOptions.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {renderModelOption(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
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
              <SelectValue placeholder="Select stability" />
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
        <div className="space-y-0.5">
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

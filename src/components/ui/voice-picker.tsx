import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { VoiceList } from "./voice-list";

type VoicePickerProps = {
  label?: string;
  className?: string;
  maxHeight?: number;
  value?: string | undefined;
  onChange: (voiceId: string | undefined) => void;
  includeDefaultItem?: boolean;
  defaultLabel?: string;
};

type ServerVoice = {
  id: string;
  name: string;
  previewUrl?: string;
  description?: string;
  imageUrl?: string;
  likedCount?: number;
  languages?: string[];
};

export function VoicePicker({
  label,
  className,
  maxHeight,
  value,
  onChange,
  includeDefaultItem = true,
  defaultLabel = "Default (from Settings)",
}: VoicePickerProps) {
  const fetchAllTTSData = useAction(api.ai.elevenlabs.fetchAllTTSData);
  const [options, setOptions] = useState<ServerVoice[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchAllTTSData({});
        const items = Array.isArray(res?.voices)
          ? (res.voices as ServerVoice[])
          : [];
        if (!cancelled) {
          setOptions(items);
        }
      } catch {
        if (!cancelled) {
          setOptions([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchAllTTSData]);

  return (
    <VoiceList
      label={label}
      className={className}
      maxHeight={maxHeight}
      options={options}
      value={value}
      onChange={onChange}
      includeDefaultItem={includeDefaultItem}
      defaultLabel={defaultLabel}
    />
  );
}

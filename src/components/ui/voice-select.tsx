import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export type VoiceOption = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
};

type VoiceSelectProps = {
  placeholder?: string;
  options: VoiceOption[];
  value?: string | undefined; // voice id or undefined for default
  onChange: (voiceId: string | undefined) => void;
  includeDefaultItem?: boolean;
  defaultLabel?: string;
};

export function VoiceSelect({
  placeholder = "Select a voice",
  options,
  value,
  onChange,
  includeDefaultItem = true,
  defaultLabel = "Default (from Settings)",
}: VoiceSelectProps) {
  const sentinelDefault = "__default__";
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const itemsById = useMemo(() => {
    const map = new Map<string, VoiceOption>();
    options.forEach(o => map.set(o.id, o));
    return map;
  }, [options]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayToggle = (id: string) => {
    const opt = itemsById.get(id);
    if (!opt?.previewUrl) {
      return;
    }
    // Pause current
    if (playingId === id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = "";
        audioRef.current = null;
      }
      setPlayingId(null);
      return;
    }
    // Switch to new
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    const audio = new Audio(opt.previewUrl);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    void audio.play();
    setPlayingId(id);
  };

  return (
    <Select
      value={value || sentinelDefault}
      onValueChange={v => {
        if (v === null) {
          return;
        }
        onChange(v === sentinelDefault ? undefined : v);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeDefaultItem && (
          <SelectItem value={sentinelDefault}>{defaultLabel}</SelectItem>
        )}
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>
            <div className="flex w-full items-center justify-between gap-3 py-1">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium leading-5">{opt.name}</div>
                {opt.description && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {opt.description}
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center">
                {opt.previewUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="h-7 w-7 p-0 rounded-full hover:bg-muted/60 focus-visible:bg-muted/60"
                    aria-pressed={playingId === opt.id}
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePlayToggle(opt.id);
                    }}
                  >
                    {playingId === opt.id ? (
                      <PauseIcon className="h-3.5 w-3.5" />
                    ) : (
                      <PlayIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

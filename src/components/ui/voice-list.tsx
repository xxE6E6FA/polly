import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Label } from "./label";

export type VoiceListOption = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
};

type VoiceListProps = {
  label?: string;
  options: VoiceListOption[];
  className?: string;
  maxHeight?: number; // px
  value?: string | undefined; // selected voice id or undefined for default
  onChange: (voiceId: string | undefined) => void;
  includeDefaultItem?: boolean;
  defaultLabel?: string;
};

export function VoiceList({
  label,
  options,
  className,
  maxHeight = 360,
  value,
  onChange,
  includeDefaultItem = true,
  defaultLabel = "Default (from Settings)",
}: VoiceListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef<boolean>(false);

  const itemsById = useMemo(() => {
    const map = new Map<string, VoiceListOption>();
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

  const selectionKey = value ?? "__default__";

  const Row = ({
    id,
    name,
    description,
    previewUrl,
    isDefault,
  }: VoiceListOption & { isDefault?: boolean }) => {
    const selected = isDefault ? value === undefined : value === id;
    const isPlaying = playingId === id;
    const containerClass = selected
      ? "relative flex w-full items-center justify-between gap-4 rounded-md pl-4 pr-3 py-2 bg-accent text-accent-foreground"
      : "relative flex w-full items-center justify-between gap-4 rounded-md pl-4 pr-3 py-2 hover:bg-muted/50 focus-within:bg-muted/50";
    return (
      <CommandItem
        value={`${name} ${description ?? ""}`}
        onSelect={() => onChange(isDefault ? undefined : id)}
        data-current={selected ? "true" : undefined}
        aria-current={selected ? "true" : undefined}
        className="group"
        data-voice-id={isDefault ? "__default__" : id}
      >
        <div className={containerClass}>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium leading-5">
              {isDefault ? defaultLabel : name}
            </div>
            {!isDefault && description && (
              <div
                className={`mt-1.5 line-clamp-2 text-xs ${selected ? "text-accent-foreground/80" : "text-muted-foreground"}`}
              >
                {description}
              </div>
            )}
          </div>
          {!isDefault && previewUrl && (
            <div className="ml-3 flex flex-shrink-0 items-center">
              <Button
                size="sm"
                variant="outline"
                type="button"
                className={`h-8 w-8 rounded-full p-0 ${
                  isPlaying
                    ? "bg-accent text-accent-foreground border-accent"
                    : "hover:bg-muted/60 focus-visible:bg-muted/60"
                }`}
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
                aria-pressed={isPlaying}
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePlayToggle(id);
                }}
              >
                {isPlaying ? (
                  <PauseIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </CommandItem>
    );
  };

  // Auto-scroll to selected item after options render (first pass only)
  const scrollToCurrent = useCallback(() => {
    if (hasAutoScrolled.current) {
      return;
    }
    const selector = `[data-voice-id="${selectionKey}"]`;
    const currentEl = listRef.current?.querySelector(
      selector
    ) as HTMLElement | null;
    if (currentEl) {
      currentEl.scrollIntoView({ block: "nearest" });
      hasAutoScrolled.current = true;
    }
  }, [selectionKey]);

  // First render / selection ready
  useEffect(() => {
    if (hasAutoScrolled.current) {
      return;
    }
    const handle = window.requestAnimationFrame(scrollToCurrent);
    return () => window.cancelAnimationFrame(handle);
  }, [scrollToCurrent]);

  // When options arrive (after fetch), try once
  useEffect(() => {
    if (hasAutoScrolled.current) {
      return;
    }
    if (options.length === 0) {
      return;
    }
    const handle = window.requestAnimationFrame(scrollToCurrent);
    return () => window.cancelAnimationFrame(handle);
  }, [options.length, scrollToCurrent]);

  return (
    <div className={`stack-md w-full ${className || ""}`}>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Command className="w-full rounded-md bg-popover shadow-sm">
        <CommandInput placeholder="Search voices..." />
        <CommandList ref={listRef} style={{ maxHeight, overflowY: "auto" }}>
          <CommandEmpty>No voices found</CommandEmpty>
          <CommandGroup className="px-2 py-3 stack-md">
            {includeDefaultItem && (
              <Row
                id="__default__"
                name={defaultLabel}
                isDefault
                description={undefined}
                previewUrl={undefined}
              />
            )}
            {options.map(opt => (
              <Row key={opt.id} {...opt} />
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

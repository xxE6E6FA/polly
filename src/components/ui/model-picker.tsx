import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Label } from "./label";

type ModelOption = {
  id: string;
  name: string;
  description?: string;
};

type ModelPickerProps = {
  label?: string;
  className?: string;
  maxHeight?: number;
  value?: string | undefined;
  onChange: (modelId: string) => void;
};

export function ModelPicker({
  label,
  className,
  maxHeight = 360,
  value,
  onChange,
}: ModelPickerProps) {
  const fetchAllTTSData = useAction(api.ai.elevenlabs.fetchAllTTSData);
  const [models, setModels] = useState<ModelOption[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchAllTTSData({});
        const items = Array.isArray(res?.models)
          ? (res.models as ModelOption[])
          : [];
        if (!cancelled) {
          setModels(items);
        }
      } catch {
        if (!cancelled) {
          setModels([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchAllTTSData]);

  const nameForValue = useMemo(() => {
    const found = models.find(m => m.id === value);
    return found?.name || value || "";
  }, [models, value]);

  // Scroll the currently selected item into view on first load or when items arrive
  const scrollToCurrent = useCallback(() => {
    if (hasAutoScrolled.current) {
      return;
    }
    const key = value ?? "__none__";
    const currentEl = listRef.current?.querySelector(
      `[data-model-id="${key}"]`
    ) as HTMLElement | null;
    if (currentEl) {
      currentEl.scrollIntoView({ block: "nearest" });
      hasAutoScrolled.current = true;
    }
  }, [value]);

  useEffect(() => {
    if (hasAutoScrolled.current) {
      return;
    }
    const handle = window.requestAnimationFrame(scrollToCurrent);
    return () => window.cancelAnimationFrame(handle);
  }, [scrollToCurrent]);

  useEffect(() => {
    if (hasAutoScrolled.current) {
      return;
    }
    if (models.length === 0) {
      return;
    }
    const handle = window.requestAnimationFrame(scrollToCurrent);
    return () => window.cancelAnimationFrame(handle);
  }, [models.length, scrollToCurrent]);

  return (
    <div className={`stack-md w-full ${className || ""}`}>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Command className="w-full rounded-md border bg-popover">
        <CommandInput placeholder="Search TTS models..." />
        <CommandList ref={listRef} style={{ maxHeight, overflowY: "auto" }}>
          <CommandEmpty>No models found</CommandEmpty>
          <CommandGroup className="px-2 py-3 stack-md">
            {models.map(m => (
              <CommandItem
                key={m.id}
                value={`${m.name} ${m.description ?? ""}`}
                onSelect={() => onChange(m.id)}
                data-current={value === m.id ? "true" : undefined}
                aria-current={value === m.id ? "true" : undefined}
                data-model-id={m.id}
              >
                <div
                  className={
                    value === m.id
                      ? "relative flex w-full items-center justify-between gap-4 rounded-md pl-4 pr-3 py-2 bg-accent text-accent-foreground"
                      : "relative flex w-full items-center justify-between gap-4 rounded-md pl-4 pr-3 py-2 hover:bg-muted/50"
                  }
                >
                  <div className="min-w-0">
                    <div className="font-medium leading-5 truncate">
                      {m.name}
                    </div>
                    {m.description && (
                      <div
                        className={`mt-1.5 line-clamp-2 text-xs ${value === m.id ? "text-accent-foreground/80" : "text-muted-foreground"}`}
                      >
                        {m.description}
                      </div>
                    )}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {/* Hidden accessible label of current selection (optional) */}
      <span className="sr-only">Selected model: {nameForValue}</span>
    </div>
  );
}

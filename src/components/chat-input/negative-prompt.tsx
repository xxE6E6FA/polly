import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NegativePromptProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onSubmit?: () => void;
}

export const NegativePrompt = memo<NegativePromptProps>(
  ({ value, onValueChange, disabled = false, textareaRef, onSubmit }) => {
    const fallbackRef = useRef<HTMLTextAreaElement | null>(null);

    const autoresizeValue = useMemo(() => `${value || ""}\u200b`, [value]);

    useEffect(() => {
      const textarea = (textareaRef ?? fallbackRef).current;
      if (textarea && value.trim().length === 0) {
        textarea.focus();
      }
    }, [textareaRef, value]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      },
      [onSubmit]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onValueChange(e.target.value);
      },
      [onValueChange]
    );

    const suggestionChips = useMemo(
      () => [
        {
          label: "Standard cleanup",
          value:
            "lowres, bad anatomy, bad hands, text, watermark, extra fingers, extra limbs",
        },
        {
          label: "Portrait touchups",
          value: "deformed face, long neck, asymmetrical eyes",
        },
        {
          label: "Hands & limbs",
          value: "mutated hands, fused fingers, extra limbs",
        },
      ],
      []
    );

    const handleSuggestionClick = useCallback(
      (suggestion: string) => {
        const normalizedExisting = value
          .split(",")
          .map(segment => segment.trim())
          .filter(Boolean);
        const existingSet = new Set(
          normalizedExisting.map(segment => segment.toLowerCase())
        );

        const additions = suggestion
          .split(",")
          .map(segment => segment.trim())
          .filter(Boolean)
          .filter(segment => !existingSet.has(segment.toLowerCase()));

        const targetRef = textareaRef ?? fallbackRef;

        if (additions.length === 0) {
          targetRef.current?.focus();
          return;
        }

        const merged = [...normalizedExisting, ...additions];
        onValueChange(merged.join(", "));
        requestAnimationFrame(() => {
          const node = targetRef.current;
          node?.focus();
        });
      },
      [onValueChange, textareaRef, value]
    );

    return (
      <div className="border-t border-border mx-2.5 mb-2 flex flex-col gap-2">
        <div
          className="mt-4 auto-resize-textarea overflow-y-auto max-h-56 sm:max-h-64"
          data-autoresize="true"
          data-replicated-value={autoresizeValue}
        >
          <textarea
            ref={textareaRef ?? fallbackRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to avoid..."
            className={cn(
              "w-full bg-transparent border-0 outline-none leading-relaxed",
              "placeholder:text-muted-foreground/60",
              disabled && "cursor-not-allowed opacity-60"
            )}
            rows={1}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          {suggestionChips.map(chip => (
            <Button
              key={chip.label}
              type="button"
              variant="link"
              size="sm"
              className="h-6 text-xs p-0"
              onClick={() => handleSuggestionClick(chip.value)}
              disabled={disabled}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }
);

NegativePrompt.displayName = "NegativePrompt";

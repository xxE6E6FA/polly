import type { Id } from "@convex/_generated/dataModel";
import { UserIcon, XIcon } from "@phosphor-icons/react";
import { memo, useEffect, useRef } from "react";
import { createHashMemoComparison } from "./hooks/use-props-hash";

interface PersonaChipProps {
  selectedPersonaId?: Id<"personas"> | null;
  currentPersona?: {
    name: string;
    icon?: string;
  } | null;
  onPersonaClear?: () => void;
  onPersonaChipWidthChange: (width: number) => void;
}

/**
 * Isolated persona chip component for better memoization
 */
export const PersonaChip = memo(function PersonaChip({
  selectedPersonaId,
  currentPersona,
  onPersonaClear,
  onPersonaChipWidthChange,
}: PersonaChipProps) {
  const personaChipRef = useRef<HTMLSpanElement>(null);

  // Measure persona chip width for proper indentation
  useEffect(() => {
    if (!selectedPersonaId) {
      onPersonaChipWidthChange(0);
      return;
    }

    const measure = () => {
      const w = personaChipRef.current?.getBoundingClientRect().width;
      onPersonaChipWidthChange(Math.ceil(w || 0));
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [selectedPersonaId, onPersonaChipWidthChange]);

  if (!selectedPersonaId) {
    return null;
  }

  return (
    <div className="absolute left-1 top-1 z-10 flex items-center gap-1 text-xs text-muted-foreground">
      <span
        ref={personaChipRef}
        className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-1.5 py-0.5"
      >
        {currentPersona?.icon ? (
          <span className="text-xs">{currentPersona.icon}</span>
        ) : (
          <UserIcon className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[140px] truncate">
          {currentPersona?.name || "Persona"}
        </span>
        <button
          type="button"
          className="ml-1 text-muted-foreground hover:text-foreground"
          onClick={onPersonaClear}
          aria-label="Clear persona"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}, createHashMemoComparison());

import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface SelectAllCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  className?: string;
}

export function SelectAllCheckbox({
  checked,
  onToggle,
  className,
}: SelectAllCheckboxProps) {
  return (
    <div className={cn(className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: matches shadcn/ui custom checkbox pattern */}
      <button
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? "Deselect all" : "Select all"}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

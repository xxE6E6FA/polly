import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface SelectAllCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  className?: string;
  disabled?: boolean;
}

export function SelectAllCheckbox({
  checked,
  onToggle,
  className,
  disabled,
}: SelectAllCheckboxProps) {
  return (
    <div className={cn(className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: matches shadcn/ui custom checkbox pattern */}
      <button
        onClick={e => {
          e.stopPropagation();
          if (!disabled) {
            onToggle();
          }
        }}
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? "Deselect all" : "Select all"}
        aria-disabled={disabled}
        disabled={disabled}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

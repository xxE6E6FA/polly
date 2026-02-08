import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface SelectionCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}

export function SelectionCheckbox({
  checked,
  onToggle,
  label,
  className,
}: SelectionCheckboxProps) {
  return (
    <div className={cn(className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: Custom shadcn/ui checkbox pattern */}
      <button
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label || (checked ? "Deselect item" : "Select item")}
      >
        {checked && <CheckIcon className="size-3" />}
      </button>
    </div>
  );
}

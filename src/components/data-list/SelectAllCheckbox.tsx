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
    <div className={cn("w-8 flex-shrink-0", className)}>
      <button
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        aria-label={checked ? "Deselect all" : "Select all"}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface SelectAllCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  className?: string;
  disabled?: boolean;
}

export function SelectAllCheckbox({
  checked,
  indeterminate,
  onToggle,
  className,
  disabled,
}: SelectAllCheckboxProps) {
  return (
    <div
      className={cn(className)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={() => onToggle()}
        aria-label={checked ? "Deselect all" : "Select all"}
        disabled={disabled}
      />
    </div>
  );
}

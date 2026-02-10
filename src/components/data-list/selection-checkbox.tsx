import { Checkbox } from "@/components/ui/checkbox";
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
    <div
      className={cn(className)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle()}
        aria-label={label || (checked ? "Deselect item" : "Select item")}
      />
    </div>
  );
}

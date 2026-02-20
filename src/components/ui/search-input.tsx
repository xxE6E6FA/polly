import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showShortcut?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search...",
  className,
  showShortcut = false,
  ref,
}: SearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose the input element via the forwarded ref
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  const clearSearch = useCallback(() => {
    onChange("");
  }, [onChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to clear search when input is focused
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        clearSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch]);

  return (
    <div className={cn("relative", className)}>
      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        className={cn(
          "pl-8 bg-background border-0 text-foreground placeholder:text-muted-foreground shadow-none",
          "focus-visible:ring-0 focus-visible:ring-offset-0",
          showShortcut && !value ? "pr-12" : "pr-9"
        )}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {!value && showShortcut && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
          <kbd className="text-xs text-muted-foreground/60 font-medium">/</kbd>
        </div>
      )}
      {value && (
        <Button
          className="absolute right-1 top-1/2 -translate-y-1/2 transform"
          size="icon-sm"
          variant="ghost"
          onClick={clearSearch}
        >
          <XIcon className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
};

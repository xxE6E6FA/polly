import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: SearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

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
      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
      <Input
        ref={inputRef}
        className="pl-8 pr-9"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <Button
          className="absolute right-1 top-1/2 -translate-y-1/2 transform"
          size="icon-sm"
          variant="ghost"
          onClick={clearSearch}
        >
          <XIcon className="h-3.5 w-3.5 text-foreground" />
        </Button>
      )}
    </div>
  );
};

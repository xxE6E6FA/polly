import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export const SidebarSearch = ({ searchQuery, onSearchChange }: SearchProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearSearch = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to clear search when search is focused
      if (
        e.key === "Escape" &&
        document.activeElement === searchInputRef.current
      ) {
        clearSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch]);

  return (
    <div className="stack-sm">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground/60" />
        <Input
          ref={searchInputRef}
          className="h-9 pl-8 pr-9 text-sm placeholder:text-muted-foreground/60"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <Button
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 transform hover:bg-transparent"
            size="icon-sm"
            variant="ghost"
            onClick={clearSearch}
          >
            <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
};

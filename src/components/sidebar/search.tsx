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

  // Special sentinel: when value is "__BATCH_BAR__" we render a fixed-height shell to avoid layout shift
  if (searchQuery === "__BATCH_BAR__") {
    return (
      <div className="space-y-2">
        <div className="relative">
          <div className="h-9 w-full rounded-md border-0 bg-muted/50 dark:bg-background/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground/60" />
        <Input
          ref={searchInputRef}
          className="h-9 border-0 bg-muted/50 dark:bg-background/80 pl-9 pr-9 text-sm transition-all duration-200 placeholder:text-muted-foreground/60 hover:bg-muted/70 dark:hover:bg-background focus:bg-muted dark:focus:bg-background dark:border dark:border-border/50 focus:outline-none focus:ring-0 rounded-md"
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

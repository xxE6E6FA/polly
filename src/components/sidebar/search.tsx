import { useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";

interface SearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function SidebarSearch({ searchQuery, onSearchChange }: SearchProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearSearch = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
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
    <div className="space-y-2">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/60 h-4 w-4" />
        <Input
          ref={searchInputRef}
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="bg-muted/50 border-0 placeholder:text-muted-foreground/60 transition-all duration-200 focus:bg-muted focus:ring-0 focus:outline-none hover:bg-muted/70 pl-9 pr-9 h-9 text-sm"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 hover:bg-transparent h-7 w-7"
          >
            <XIcon className="text-muted-foreground h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

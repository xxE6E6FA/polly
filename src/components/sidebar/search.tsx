import { useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, MessageCircle } from "lucide-react";
import { useConversationSearch } from "@/hooks/use-conversation-search";
import { api } from "../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { useUser } from "@/hooks/use-user";

interface SearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function SidebarSearch({ searchQuery, onSearchChange }: SearchProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();
  const conversations = useQuery(
    api.conversations.list,
    user ? { userId: user._id } : "skip"
  );

  const filteredConversations = useConversationSearch(
    conversations || [],
    searchQuery
  );

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

  const isSearchActive = searchQuery.trim().length > 0;
  const totalResults = filteredConversations.length;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/60 h-4 w-4" />
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
            <X className="text-muted-foreground h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Search results summary */}
      {isSearchActive && (
        <div className="text-muted-foreground px-2 flex items-center gap-2 text-xs">
          <MessageCircle className="h-3 w-3" />
          <span className="text-xs">
            {totalResults === 0
              ? "No conversations found"
              : totalResults === 1
                ? "1 conversation found"
                : `${totalResults} conversations found`}
          </span>
        </div>
      )}
    </div>
  );
}

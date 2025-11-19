import { useEffect, useRef } from "react";
import { SearchInput } from "@/components/ui/search-input";

type SearchProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export const SidebarSearch = ({ searchQuery, onSearchChange }: SearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "/" to focus search (common pattern in modern web apps)
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        // Only handle if we're not already in an input/textarea
        const activeElement = document.activeElement;
        const isInInput =
          activeElement?.tagName === "INPUT" ||
          activeElement?.tagName === "TEXTAREA" ||
          activeElement?.hasAttribute("contenteditable");

        if (!isInInput && inputRef.current) {
          e.preventDefault();
          inputRef.current.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SearchInput
      ref={inputRef}
      value={searchQuery}
      onChange={onSearchChange}
      placeholder="Search conversations..."
      showShortcut={true}
    />
  );
};

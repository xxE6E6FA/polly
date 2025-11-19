import { SearchInput } from "@/components/ui/search-input";

type SearchProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export const SidebarSearch = ({ searchQuery, onSearchChange }: SearchProps) => {
  return (
    <SearchInput
      value={searchQuery}
      onChange={onSearchChange}
      placeholder="Search conversations..."
    />
  );
};

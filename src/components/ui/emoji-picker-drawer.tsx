import { MagnifyingGlass, Smiley } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

// Emoji categories with mobile-optimized selection
const EMOJI_CATEGORIES = {
  people: {
    label: "People",
    icon: "😀",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "😊",
      "😇",
      "🙂",
      "🙃",
      "😉",
      "😌",
      "😍",
      "🥰",
      "😘",
      "😗",
      "😙",
      "😚",
      "😋",
      "😛",
      "😝",
      "😜",
      "🤪",
      "🤨",
      "🧐",
      "🤓",
      "😎",
      "🤩",
      "🥳",
      "😏",
      "😒",
      "😞",
      "😔",
      "😟",
      "😕",
      "🙁",
      "☹️",
      "😣",
      "😖",
      "😫",
      "😩",
      "🥺",
      "😢",
      "😭",
      "😤",
      "😠",
      "😡",
      "🤬",
      "🤯",
      "😳",
      "🥵",
      "🥶",
      "😱",
      "😨",
      "😰",
      "😥",
      "😓",
      "🤗",
      "🤔",
      "🤭",
      "🤫",
      "🤥",
    ],
  },
  nature: {
    label: "Nature",
    icon: "🌱",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐽",
      "🐸",
      "🐵",
      "🙈",
      "🙉",
      "🙊",
      "🐒",
      "🐔",
      "🐧",
      "🐦",
      "🐤",
      "🐣",
      "🐥",
      "🦆",
      "🦅",
      "🦉",
      "🦇",
      "🐺",
      "🐗",
      "🐴",
      "🦄",
      "🐝",
      "🐛",
      "🦋",
      "🐌",
      "🐞",
      "🐜",
      "🦟",
      "🦗",
      "🕷️",
      "🦂",
      "🐢",
      "🐍",
      "🦎",
      "🐙",
    ],
  },
  food: {
    label: "Food",
    icon: "🍕",
    emojis: [
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍈",
      "🍒",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🍅",
      "🍆",
      "🥑",
      "🥦",
      "🥬",
      "🥒",
      "🌶️",
      "🫑",
      "🌽",
      "🥕",
      "🫒",
      "🧄",
      "🧅",
      "🥔",
      "🍠",
      "🥐",
      "🥖",
      "🍞",
      "🥨",
      "🥯",
      "🧀",
      "🥚",
      "🍳",
      "🧈",
      "🥞",
      "🧇",
      "🥓",
      "🥩",
      "🍗",
      "🍖",
      "🦴",
      "🌭",
    ],
  },
  activities: {
    label: "Activities",
    icon: "⚽",
    emojis: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🥎",
      "🎾",
      "🏐",
      "🏉",
      "🥏",
      "🎱",
      "🪀",
      "🏓",
      "🏸",
      "🏒",
      "🏑",
      "🥍",
      "🏏",
      "🪃",
      "🥅",
      "⛳",
      "🪁",
      "🏹",
      "🎣",
      "🤿",
      "🥊",
      "🥋",
      "🎽",
      "🛹",
      "🛼",
      "🛷",
      "⛸️",
      "🥌",
      "🎿",
      "⛷️",
      "🏂",
      "🪂",
      "🏋️",
      "🤸",
      "🤼",
      "🤽",
      "🤾",
      "🧗",
      "🚵",
      "🚴",
      "🏆",
      "🥇",
      "🥈",
      "🥉",
    ],
  },
  objects: {
    label: "Objects",
    icon: "💡",
    emojis: [
      "💡",
      "🔦",
      "🕯️",
      "🪔",
      "🧯",
      "🛢️",
      "💸",
      "💰",
      "💴",
      "💵",
      "💶",
      "💷",
      "🪙",
      "💳",
      "💎",
      "⚖️",
      "🪜",
      "🧰",
      "🪛",
      "🔧",
      "🔨",
      "⚒️",
      "🛠️",
      "⛏️",
      "🪓",
      "🪚",
      "🔩",
      "⚙️",
      "🪤",
      "🧲",
      "🪃",
      "💣",
      "🧨",
      "🪓",
      "🔪",
      "⚔️",
      "🛡️",
      "🚬",
      "⚰️",
      "🪦",
      "⚱️",
      "🏺",
      "🔮",
      "📿",
      "🧿",
      "💈",
      "⚗️",
      "🔭",
    ],
  },
  symbols: {
    label: "Symbols",
    icon: "❤️",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💟",
      "☮️",
      "✝️",
      "☪️",
      "🕉️",
      "☸️",
      "✡️",
      "🔯",
      "🕎",
      "☯️",
      "☦️",
      "🛐",
      "⛎",
      "♈",
      "♉",
      "♊",
      "♋",
      "♌",
      "♍",
      "♎",
      "♏",
      "♐",
      "♑",
      "♒",
      "♓",
      "🆔",
      "⚛️",
      "🉑",
      "☢️",
      "☣️",
    ],
  },
};

interface EmojiPickerDrawerProps {
  onEmojiSelect: (emoji: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function EmojiPickerDrawer({
  onEmojiSelect,
  disabled = false,
  children,
}: EmojiPickerDrawerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleEmojiSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
  }, []);

  // Filter emojis based on search - return all categories or search results
  const displayData = useMemo(() => {
    if (!searchQuery) {
      // Return all categories for vertical scrolling
      return Object.entries(EMOJI_CATEGORIES).map(([key, category]) => ({
        key,
        label: category.label,
        emojis: category.emojis,
      }));
    }

    // Simple search across all categories
    const allEmojis = Object.values(EMOJI_CATEGORIES).flatMap(
      cat => cat.emojis
    );
    const filteredEmojis = allEmojis.filter(
      emoji =>
        // This is a simple filter - in a real app you'd want emoji metadata for better search
        emoji.includes(searchQuery) ||
        Object.values(EMOJI_CATEGORIES).some(
          cat =>
            cat.emojis.includes(emoji) &&
            cat.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    // Return search results as a single section
    return [
      {
        key: "search",
        label: "Search Results",
        emojis: filteredEmojis,
      },
    ];
  }, [searchQuery]);

  // Handle Esc key to close
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleClose]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger>
        {children || (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Select emoji"
            className="h-9 w-9 p-0 rounded-full sm:hidden bg-muted/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={disabled}
          >
            <Smiley className="size-4" />
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        {/* Non-scrollable search bar */}
        <div className="bg-background border-b p-4">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search emojis..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>

        {/* Vertically scrolling emoji sections */}
        <div className="flex-1 overflow-y-auto">
          {displayData.map(section => (
            <div key={section.key} className="pb-6">
              {/* Section header */}
              <div className="sticky top-0 bg-background border-b px-4 py-3 z-10">
                <h3 className="text-sm font-semibold text-foreground">
                  {section.label}
                </h3>
              </div>

              {/* Emoji grid for this section */}
              <div className="p-4">
                <div className="grid grid-cols-8 gap-2">
                  {section.emojis.map((emoji, index) => (
                    <button
                      key={`${section.key}-${index}`}
                      onClick={() => handleEmojiSelect(emoji)}
                      className="flex items-center justify-center h-12 w-12 rounded-xl hover:bg-muted active:bg-muted/80 transition-colors text-2xl active:scale-95 transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {displayData.length === 1 && displayData[0]?.emojis.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No emojis found</p>
            </div>
          )}

          {/* Bottom padding for safe area */}
          <div className="h-safe pb-4" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

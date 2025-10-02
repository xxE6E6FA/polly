import { Minus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { NegativePromptToggle } from "./negative-prompt-toggle";

interface NegativePromptDrawerProps {
  enabled: boolean;
  value: string;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  onSubmit?: () => void;
}

export function NegativePromptDrawer({
  enabled,
  value,
  onEnabledChange,
  onValueChange,
  disabled = false,
  onSubmit,
}: NegativePromptDrawerProps) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Negative prompt"
          className="h-9 w-9 rounded-full p-0 sm:hidden bg-accent/60 text-accent-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <Minus className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Negative Prompt</DrawerTitle>
        </DrawerHeader>
        <div className="p-4">
          <NegativePromptToggle
            enabled={enabled}
            value={value}
            onEnabledChange={onEnabledChange}
            onValueChange={onValueChange}
            disabled={disabled}
            onSubmit={onSubmit}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

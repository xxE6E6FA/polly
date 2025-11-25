import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface MobileDrawerAction<TItem> {
  /** Unique key for React rendering */
  key: string;
  /** Icon component to display */
  icon: React.ComponentType<{ className?: string }>;
  /** Label text for the action */
  label: string | ((item: TItem) => string);
  /** Handler when action is clicked */
  onClick: (item: TItem) => void;
  /** Whether this action is disabled */
  disabled?: boolean | ((item: TItem) => boolean);
  /** Custom className for styling (e.g., destructive actions) */
  className?: string;
  /** For toggle actions - renders a Switch instead of button */
  toggle?: {
    checked: (item: TItem) => boolean;
    onCheckedChange: (item: TItem, checked: boolean) => void;
  };
  /** When true, action is hidden for this item */
  hidden?: (item: TItem) => boolean;
}

export interface MobileDrawerConfig<TItem> {
  /** Title for the drawer header */
  title: string | ((item: TItem) => string);
  /** Optional subtitle/description */
  subtitle?: string | ((item: TItem) => string);
  /** Array of actions to display in the drawer */
  actions: MobileDrawerAction<TItem>[];
  /** Whether tapping the row opens the drawer (default: true) */
  openOnRowTap?: boolean;
  /** Custom trigger render (default: 3-dot menu icon) */
  triggerRender?: (item: TItem) => React.ReactNode;
}

interface DataListMobileDrawerProps<TItem> {
  item: TItem;
  config: MobileDrawerConfig<TItem>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DataListMobileDrawer<TItem>({
  item,
  config,
  open,
  onOpenChange,
}: DataListMobileDrawerProps<TItem>) {
  const title =
    typeof config.title === "function" ? config.title(item) : config.title;

  const subtitle =
    typeof config.subtitle === "function"
      ? config.subtitle(item)
      : config.subtitle;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {subtitle && <DrawerDescription>{subtitle}</DrawerDescription>}
        </DrawerHeader>
        <DrawerBody>
          <div className="flex flex-col">
            {config.actions.map(action => {
              const isHidden = action.hidden?.(item);
              if (isHidden) {
                return null;
              }

              const label =
                typeof action.label === "function"
                  ? action.label(item)
                  : action.label;
              const isDisabled =
                typeof action.disabled === "function"
                  ? action.disabled(item)
                  : action.disabled;

              // Toggle action renders differently
              if (action.toggle) {
                return (
                  <div
                    key={action.key}
                    className={cn(
                      "flex items-center justify-between h-12 px-3 rounded-md",
                      isDisabled && "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <action.icon className="h-4 w-4" />
                      <span className="text-sm">{label}</span>
                    </div>
                    <Switch
                      checked={action.toggle.checked(item)}
                      onCheckedChange={checked => {
                        action.toggle?.onCheckedChange(item, checked);
                      }}
                      disabled={isDisabled}
                    />
                  </div>
                );
              }

              // Regular button action
              return (
                <Button
                  key={action.key}
                  className={cn(
                    "h-10 justify-start gap-2 px-3 text-sm",
                    action.className
                  )}
                  size="sm"
                  variant="ghost"
                  disabled={isDisabled}
                  onClick={() => {
                    action.onClick(item);
                    onOpenChange(false);
                  }}
                >
                  <action.icon className="h-4 w-4" />
                  {label}
                </Button>
              );
            })}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

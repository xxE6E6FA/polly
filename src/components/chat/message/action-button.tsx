import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  HeartIcon,
  NotePencilIcon,
  TextAaIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";

export type ActionButtonVariant = "default" | "destructive";

export type ActionButtonProps = {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  ariaLabel?: string;
  /** Button variant - affects hover/active colors */
  variant?: ActionButtonVariant;
};

// Base styles shared by all variants
const baseStyles = [
  "flex items-center justify-center",
  "h-7 w-7 rounded-md",
  "border border-transparent",
  "transition-all duration-200 ease-out",
  "motion-safe:hover:scale-105",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

// Default variant: subtle gray hover
const defaultStyles = [
  "text-muted-foreground",
  "hover:bg-muted/50 hover:border-border/50 hover:text-foreground",
  "active:bg-muted",
].join(" ");

// Destructive variant: red hover
const destructiveStyles = [
  "text-muted-foreground",
  "hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive",
  "active:bg-destructive/15",
].join(" ");

const variantStyles: Record<ActionButtonVariant, string> = {
  default: defaultStyles,
  destructive: destructiveStyles,
};

/**
 * Export style utilities for use with external trigger components
 * (e.g., ResponsivePicker triggers that can't use ActionButton directly)
 */
export const actionButtonStyles = {
  base: baseStyles,
  default: defaultStyles,
  destructive: destructiveStyles,
  /** Combined base + default styles */
  get defaultButton() {
    return `${baseStyles} ${defaultStyles}`;
  },
  /** Combined base + destructive styles */
  get destructiveButton() {
    return `${baseStyles} ${destructiveStyles}`;
  },
};

/**
 * Standard action button with tooltip, consistent sizing, and hover effects.
 * Use for icon-only action buttons in toolbars, message actions, etc.
 */
export const ActionButton = memo(
  ({
    icon,
    tooltip,
    onClick,
    disabled,
    title,
    className,
    ariaLabel,
    variant = "default",
  }: ActionButtonProps) => {
    return (
      <Tooltip>
        <TooltipTrigger>
          <button
            type="button"
            className={cn(baseStyles, variantStyles[variant], className)}
            disabled={disabled}
            title={title}
            aria-label={ariaLabel || tooltip}
            onClick={onClick}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
);

ActionButton.displayName = "ActionButton";

// ============================================================================
// Icon wrapper for consistent sizing
// ============================================================================

type ActionIconProps = {
  className?: string;
};

const iconClass = "h-3.5 w-3.5";

// ============================================================================
// Icon size constants for consistent sizing across components
// ============================================================================

/** Icon size for desktop action buttons (h-3.5 w-3.5) */
export const ACTION_ICON_SIZE = "h-3.5 w-3.5";
/** Icon size for mobile drawer items (h-4 w-4) */
export const DRAWER_ICON_SIZE = "h-4 w-4";

/**
 * Pre-styled icons for use with ActionButton.
 * All icons have consistent sizing (h-3.5 w-3.5) and aria-hidden.
 */
export const ActionIcon = {
  Copy: ({ className }: ActionIconProps = {}) => (
    <CopyIcon className={cn(iconClass, className)} aria-hidden="true" />
  ),
  Check: ({ className }: ActionIconProps = {}) => (
    <CheckIcon className={cn(iconClass, className)} aria-hidden="true" />
  ),
  Edit: ({ className }: ActionIconProps = {}) => (
    <NotePencilIcon className={cn(iconClass, className)} aria-hidden="true" />
  ),
  Delete: ({ className }: ActionIconProps = {}) => (
    <TrashIcon className={cn(iconClass, className)} aria-hidden="true" />
  ),
  Favorite: ({ className, filled }: ActionIconProps & { filled?: boolean }) => (
    <HeartIcon
      className={cn(iconClass, className)}
      weight={filled ? "fill" : "regular"}
      aria-hidden="true"
    />
  ),
  Branch: ({ className }: ActionIconProps = {}) => (
    <GitBranchIcon className={cn(iconClass, className)} aria-hidden="true" />
  ),
  Retry: ({ className }: ActionIconProps = {}) => (
    <ArrowCounterClockwiseIcon
      className={cn(iconClass, className)}
      aria-hidden="true"
    />
  ),
  ZenMode: ({ className }: ActionIconProps = {}) => (
    <TextAaIcon className={cn(iconClass, className)} aria-hidden="true" />
  ),
};

// ============================================================================
// Preset action buttons for common use cases
// ============================================================================

type PresetActionButtonProps = Omit<
  ActionButtonProps,
  "icon" | "variant" | "tooltip"
> & {
  /** Override the default tooltip */
  tooltip?: string;
  /** For copy button: whether currently showing copied state */
  copied?: boolean;
  /** For favorite button: whether currently favorited */
  favorited?: boolean;
};

/**
 * Pre-configured action buttons for common actions.
 * These combine the icon, variant, and sensible defaults.
 */
export const ActionButtons = {
  Copy: memo(({ copied, tooltip, ...props }: PresetActionButtonProps) => (
    <ActionButton
      icon={copied ? <ActionIcon.Check /> : <ActionIcon.Copy />}
      tooltip={tooltip || (copied ? "Copied!" : "Copy")}
      {...props}
    />
  )),

  Delete: memo(({ tooltip, ...props }: PresetActionButtonProps) => (
    <ActionButton
      variant="destructive"
      icon={<ActionIcon.Delete />}
      tooltip={tooltip || "Delete"}
      {...props}
    />
  )),

  Edit: memo(({ tooltip, ...props }: PresetActionButtonProps) => (
    <ActionButton
      icon={<ActionIcon.Edit />}
      tooltip={tooltip || "Edit"}
      {...props}
    />
  )),

  Favorite: memo(
    ({ favorited, tooltip, ...props }: PresetActionButtonProps) => (
      <ActionButton
        icon={
          <ActionIcon.Favorite
            filled={favorited}
            className={favorited ? "text-destructive" : undefined}
          />
        }
        tooltip={tooltip || (favorited ? "Unfavorite" : "Favorite")}
        {...props}
      />
    )
  ),

  Branch: memo(({ tooltip, ...props }: PresetActionButtonProps) => (
    <ActionButton
      icon={<ActionIcon.Branch />}
      tooltip={tooltip || "Branch from here"}
      {...props}
    />
  )),

  Retry: memo(({ tooltip, ...props }: PresetActionButtonProps) => (
    <ActionButton
      icon={<ActionIcon.Retry />}
      tooltip={tooltip || "Retry"}
      {...props}
    />
  )),

  ZenMode: memo(({ tooltip, ...props }: PresetActionButtonProps) => (
    <ActionButton
      icon={<ActionIcon.ZenMode />}
      tooltip={tooltip || "Zen mode"}
      {...props}
    />
  )),
};

// Set display names for debugging
ActionButtons.Copy.displayName = "ActionButtons.Copy";
ActionButtons.Delete.displayName = "ActionButtons.Delete";
ActionButtons.Edit.displayName = "ActionButtons.Edit";
ActionButtons.Favorite.displayName = "ActionButtons.Favorite";
ActionButtons.Branch.displayName = "ActionButtons.Branch";
ActionButtons.Retry.displayName = "ActionButtons.Retry";
ActionButtons.ZenMode.displayName = "ActionButtons.ZenMode";

// ============================================================================
// DrawerItem for mobile drawer/sheet menus
// ============================================================================

type DrawerItemProps = {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  destructive?: boolean;
};

/**
 * Standard drawer item for mobile menus.
 * Provides consistent styling for full-width list items with icons.
 */
export const DrawerItem = memo(function DrawerItem({
  icon,
  children,
  onClick,
  className,
  destructive = false,
}: DrawerItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2.5",
        "border-b border-border/30 last:border-b-0",
        "hover:bg-muted/50 transition-colors text-left",
        destructive && "text-destructive hover:bg-destructive/10",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
});

DrawerItem.displayName = "DrawerItem";

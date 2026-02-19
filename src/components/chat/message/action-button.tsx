import { TextAaIcon } from "@phosphor-icons/react";
import { memo } from "react";
import {
  AnimatedCheckIcon,
  AnimatedCopyIcon,
  AnimatedDeleteIcon,
  AnimatedEditIcon,
  AnimatedGitBranchIcon,
  AnimatedHeartIcon,
  AnimatedRetryIcon,
  useAnimatedIcon,
} from "@/components/ui/animated-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";

// ============================================================================
// ActionButton — the ONE base element for all action bar items
// ============================================================================

export type ActionButtonVariant = "default" | "destructive";
export type ActionButtonSize = "icon" | "label";

type ActionButtonProps = React.ComponentProps<"button"> & {
  variant?: ActionButtonVariant;
  /** `icon` (default) = fixed square, `label` = auto-width with padding */
  size?: ActionButtonSize;
  /** When set, wraps the chip in a Tooltip with this text */
  tooltip?: string;
  ref?: React.Ref<HTMLButtonElement>;
};

const chipBase = [
  "appearance-none",
  "flex items-center justify-center",
  "h-6 rounded-md",
  "border border-transparent",
  "text-muted-foreground text-xs",
  "transition-all duration-200 ease-out",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

const chipSizes: Record<ActionButtonSize, string> = {
  icon: "w-6",
  label: "w-auto px-1.5 gap-1",
};

const chipVariants: Record<ActionButtonVariant, string> = {
  default: [
    "hover:bg-muted/50 hover:border-border/50 hover:text-foreground",
    "active:bg-muted",
  ].join(" "),
  destructive: [
    "hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive",
    "active:bg-destructive/15",
  ].join(" "),
};

/**
 * Returns the computed class string for an ActionButton.
 * Use this when you need the className but can't render an `<ActionButton>` element
 * (e.g. passing `triggerClassName` to `ResponsivePicker`).
 */
export function actionButtonClass(
  opts: { variant?: ActionButtonVariant; size?: ActionButtonSize } = {}
): string {
  const { variant = "default", size = "icon" } = opts;
  return `${chipBase} ${chipSizes[size]} ${chipVariants[variant]}`;
}

/**
 * Base visual element for ALL action bar items.
 * Use `size="icon"` (default) for square icon buttons,
 * `size="label"` for text chips (gen stats, model badge, sources).
 *
 * When `tooltip` is set, the chip wraps itself in a `Tooltip`.
 * When absent, renders a bare `<button>` (for composition via external `render` props).
 */
export function ActionButton({
  className,
  variant = "default",
  size = "icon",
  tooltip,
  ref,
  ...props
}: ActionButtonProps) {
  const chipClassName = cn(
    chipBase,
    chipSizes[size],
    chipVariants[variant],
    className
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger
          delayDuration={200}
          render={<button ref={ref} type="button" className={chipClassName} />}
          aria-label={props["aria-label"] || tooltip}
          disabled={props.disabled}
          onClick={props.onClick}
          onMouseEnter={props.onMouseEnter}
          onMouseLeave={props.onMouseLeave}
        >
          {props.children}
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button ref={ref} type="button" className={chipClassName} {...props} />
  );
}

/** Icon size for mobile drawer items (size-4) */
export const DRAWER_ICON_SIZE = "size-4";

const iconClass = "size-3.5";

// ============================================================================
// Preset action buttons
// ============================================================================

type PresetActionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  ariaLabel?: string;
  tooltip?: string;
  copied?: boolean;
  favorited?: boolean;
};

export const ActionButtons = {
  Copy: memo(function CopyActionButton({
    copied,
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    const { controls, onHoverStart, onHoverEnd } = useAnimatedIcon();
    return (
      <ActionButton
        tooltip={tooltip || (copied ? "Copied!" : "Copy")}
        aria-label={ariaLabel || tooltip || (copied ? "Copied!" : "Copy")}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        {...props}
      >
        {copied ? (
          <AnimatedCheckIcon
            controls={controls}
            className={cn(iconClass, "text-primary animate-copy-success")}
          />
        ) : (
          <AnimatedCopyIcon controls={controls} className={iconClass} />
        )}
      </ActionButton>
    );
  }),

  Delete: memo(function DeleteActionButton({
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    const { controls, onHoverStart, onHoverEnd } = useAnimatedIcon();
    return (
      <ActionButton
        variant="destructive"
        tooltip={tooltip || "Delete"}
        aria-label={ariaLabel || tooltip || "Delete"}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        {...props}
      >
        <AnimatedDeleteIcon controls={controls} className={iconClass} />
      </ActionButton>
    );
  }),

  Edit: memo(function EditActionButton({
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    const { controls, onHoverStart, onHoverEnd } = useAnimatedIcon();
    return (
      <ActionButton
        tooltip={tooltip || "Edit"}
        aria-label={ariaLabel || tooltip || "Edit"}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        {...props}
      >
        <AnimatedEditIcon controls={controls} className={iconClass} />
      </ActionButton>
    );
  }),

  Favorite: memo(function FavoriteActionButton({
    favorited,
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    const { controls, onHoverStart, onHoverEnd } = useAnimatedIcon();
    return (
      <ActionButton
        tooltip={tooltip || (favorited ? "Unfavorite" : "Favorite")}
        aria-label={
          ariaLabel || tooltip || (favorited ? "Unfavorite" : "Favorite")
        }
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        {...props}
      >
        <AnimatedHeartIcon
          controls={controls}
          className={cn(iconClass, favorited && "text-destructive")}
          filled={!!favorited}
        />
      </ActionButton>
    );
  }),

  Branch: memo(function BranchActionButton({
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    const { controls, onHoverStart, onHoverEnd } = useAnimatedIcon();
    return (
      <ActionButton
        tooltip={tooltip || "Branch from here"}
        aria-label={ariaLabel || tooltip || "Branch from here"}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        {...props}
      >
        <AnimatedGitBranchIcon controls={controls} className={iconClass} />
      </ActionButton>
    );
  }),

  Retry: memo(function RetryActionButton({
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    const { controls, onHoverStart, onHoverEnd } = useAnimatedIcon();
    return (
      <ActionButton
        tooltip={tooltip || "Retry"}
        aria-label={ariaLabel || tooltip || "Retry"}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        {...props}
      >
        <AnimatedRetryIcon controls={controls} className={iconClass} />
      </ActionButton>
    );
  }),

  ZenMode: memo(function ZenModeActionButton({
    tooltip,
    ariaLabel,
    ...props
  }: PresetActionButtonProps) {
    return (
      <ActionButton
        tooltip={tooltip || "Zen mode"}
        aria-label={ariaLabel || tooltip || "Zen mode"}
        {...props}
      >
        <TextAaIcon className={iconClass} aria-hidden="true" />
      </ActionButton>
    );
  }),
};

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

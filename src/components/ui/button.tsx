import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Base styles for menu items used in ContextMenu, DropdownMenu, and similar components.
 * Combine with data-attribute states for highlighted/disabled styling.
 *
 * @example
 * ```tsx
 * <ContextMenu.Item className={cn(menuItemBaseStyles, "data-[highlighted]:bg-muted")}>
 *   Item
 * </ContextMenu.Item>
 * ```
 */
export const menuItemBaseStyles =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none";

/**
 * Default data-attribute states for menu items (highlighted and disabled).
 */
export const menuItemStateStyles =
  "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/**
 * Button variants using CVA (class-variance-authority).
 *
 * @variant default - Primary action button with solid background
 * @variant destructive - For dangerous/irreversible actions (alias: danger)
 * @variant outline - Secondary button with border, transparent background
 * @variant secondary - Low-emphasis button with subtle background
 * @variant ghost - Minimal button, visible only on hover
 * @variant action - Custom action button styles (uses .btn-action class)
 * @variant link - Text-only button styled as a link
 * @variant tropical - Gradient button for special CTAs
 * @variant primary - Alias for default
 * @variant success - Positive action (save, confirm, complete)
 * @variant warning - Cautionary action
 * @variant info - Informational action
 * @variant danger - Destructive action (delete, remove)
 *
 * @size default - Standard size (h-9)
 * @size sm - Compact size (h-8)
 * @size lg - Large size (h-10)
 * @size icon - Square icon button (h-9 w-9)
 * @size icon-sm - Compact icon button (h-8 w-8)
 * @size icon-pill - Circular icon button
 * @size pill - Rounded pill shape
 * @size menu - For drawer/menu action lists (h-10, left-aligned)
 * @size full - Full width
 * @size full-lg - Full width, large
 */
const buttonVariants = cva(
  "flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer transition-colors transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[.98] active:shadow-sm",
  {
    variants: {
      variant: {
        /** Primary action button with solid background */
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover focus-visible:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:bg-destructive/90",
        outline:
          "border border-input-border bg-background shadow-sm hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover focus-visible:bg-secondary-hover",
        ghost:
          "hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
        action: "btn-action",
        link: "text-primary underline-offset-4 hover:underline focus-visible:underline",
        tropical:
          "bg-gradient-tropical text-white shadow-lg transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl focus-visible:scale-105 focus-visible:shadow-xl",
        // Semantic variants
        primary:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover focus-visible:bg-primary-hover",
        success:
          "bg-success text-success-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-success-hover hover:shadow-lg focus-visible:bg-success-hover focus-visible:shadow-lg",
        warning:
          "bg-warning text-warning-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-warning-hover hover:shadow-lg focus-visible:bg-warning-hover focus-visible:shadow-lg",
        info: "bg-info text-info-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-info-hover hover:shadow-lg focus-visible:bg-info-hover focus-visible:shadow-lg",
        danger:
          "bg-danger text-danger-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-danger-hover hover:shadow-lg focus-visible:bg-danger-hover focus-visible:shadow-lg",
        /** Subtle danger variant for retry/error actions */
        "danger-subtle":
          "bg-danger/10 text-danger hover:bg-danger/20 focus-visible:bg-danger/20",
        purple:
          "bg-accent-purple text-primary-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-accent-purple/90 hover:shadow-lg focus-visible:bg-accent-purple/90 focus-visible:shadow-lg",
        "chat-input":
          "dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted",
        "chat-trigger":
          "bg-muted/60 text-foreground hover:bg-muted focus-visible:bg-muted",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-md",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-5",
        icon: "h-9 w-9 rounded-md",
        "icon-sm": "h-8 w-8 p-0 rounded-md",
        "icon-pill": "h-8 w-8 p-0 rounded-full",
        pill: "h-8 w-auto gap-2 px-2.5 text-xs rounded-full",
        full: "h-9 w-full px-4 py-2 rounded-md",
        "full-lg": "h-10 w-full px-5 rounded-md",
        /** For menu/drawer action lists - taller, left-aligned */
        menu: "h-10 justify-start gap-2 px-3 rounded-md",
      },
      rounded: {
        true: "rounded-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      rounded: false,
    },
  }
);

type VariantOptions = VariantProps<typeof buttonVariants>;

// Base props shared between button and anchor
type ButtonBaseProps = VariantOptions & {
  className?: string;
};

// Button-specific props (default behavior)
export type ButtonAsButtonProps = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    as?: "button";
    ref?: React.Ref<HTMLButtonElement>;
  };

// Anchor-specific props
export type ButtonAsAnchorProps = ButtonBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    as: "a";
    ref?: React.Ref<HTMLAnchorElement>;
  };

// Union type for external use
export type ButtonProps = ButtonAsButtonProps | ButtonAsAnchorProps;

function Button(props: ButtonProps) {
  const { className, variant, size, rounded, ...rest } = props;
  const classes = cn(buttonVariants({ variant, size, rounded, className }));

  if (rest.as === "a") {
    const { as: _as, ref, ...anchorProps } = rest as ButtonAsAnchorProps;
    return <a ref={ref} className={classes} {...anchorProps} />;
  }

  const { as: _as, ref, ...buttonProps } = rest as ButtonAsButtonProps;
  return <button ref={ref} className={classes} {...buttonProps} />;
}

export { Button, buttonVariants };

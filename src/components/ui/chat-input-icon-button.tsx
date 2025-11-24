import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatInputIconButtonSize = "sm" | "default";
type ChatInputIconButtonVariant = "default" | "ghost";

interface ChatInputIconButtonProps
  extends Omit<ButtonProps, "size" | "variant" | "className"> {
  /**
   * Size variant for the button
   * - "default": h-8 w-8 (standard chat input size)
   * - "sm": h-7 w-7 (for compact contexts like recording controls)
   */
  size?: ChatInputIconButtonSize;
  /**
   * Visual variant for the button
   * - "default": Primary background (standard)
   * - "ghost": Transparent background with hover effects
   */
  variant?: ChatInputIconButtonVariant;
}

/**
 * ChatInputIconButton - Standardized icon button for chat input controls
 * Provides consistent styling with size and variant options for different contexts
 * Used by all icon buttons in the chat input area for visual consistency
 *
 * NOTE: className prop is intentionally omitted to prevent style overrides
 * and ensure complete visual consistency across all chat input buttons
 */
export const ChatInputIconButton = React.forwardRef<
  HTMLButtonElement,
  ChatInputIconButtonProps
>(({ size = "default", variant = "default", ...props }, ref) => {
  const sizeClasses = {
    default: "h-8 w-8",
    sm: "h-7 w-7",
  };

  const buttonSize = size === "default" ? "icon-pill" : "icon-sm";
  const buttonVariant = variant;

  return (
    <Button
      ref={ref}
      variant={buttonVariant}
      size={buttonSize}
      className={cn("shrink-0 rounded-full", sizeClasses[size])}
      {...props}
    />
  );
});

ChatInputIconButton.displayName = "ChatInputIconButton";

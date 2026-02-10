import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatInputIconButtonSize = "sm" | "default";
type ChatInputIconButtonVariant = "default" | "ghost";

export type ChatInputIconButtonProps = Omit<ButtonProps, "size" | "variant"> & {
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
};

export function ChatInputIconButton({
  size = "default",
  variant = "default",
  className,
  ref,
  ...props
}: ChatInputIconButtonProps) {
  const sizeClasses = {
    default:
      "h-[var(--chat-input-button-size-default)] w-[var(--chat-input-button-size-default)]",
    sm: "h-[var(--chat-input-button-size-sm)] w-[var(--chat-input-button-size-sm)]",
  };

  const buttonSize = size === "default" ? "icon-pill" : "icon-sm";

  return (
    <Button
      ref={ref}
      variant={variant}
      size={buttonSize}
      className={cn("shrink-0 rounded-full", sizeClasses[size], className)}
      {...props}
    />
  );
}

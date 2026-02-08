import { CheckCircle } from "@phosphor-icons/react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// PickerHeader - Title bar for picker content with optional action
// =============================================================================

interface PickerHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

export function PickerHeader({ title, action, className }: PickerHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2.5 border-b border-border/40",
        className
      )}
    >
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  );
}

// =============================================================================
// PickerSection - Groups related options with an optional label
// =============================================================================

interface PickerSectionProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
  /** Add top border separator */
  bordered?: boolean;
}

export function PickerSection({
  label,
  children,
  className,
  bordered = false,
}: PickerSectionProps) {
  return (
    <div
      className={cn(
        "py-1.5",
        bordered && "border-t border-border/40",
        className
      )}
    >
      {label && (
        <div className="px-3 py-1.5 text-overline font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

// =============================================================================
// PickerOption - Individual selectable item in picker content
// =============================================================================

interface PickerOptionProps {
  /** Main label text */
  label: string;
  /** Optional description text */
  description?: string;
  /** Optional icon element */
  icon?: React.ReactNode;
  /** Optional right-side content (badge, value, etc.) */
  suffix?: React.ReactNode;
  /** Whether this option is currently selected */
  selected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Whether option is disabled */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

export function PickerOption({
  label,
  description,
  icon,
  suffix,
  selected = false,
  onClick,
  disabled = false,
  className,
}: PickerOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Base styles
        "flex items-center gap-2 w-full px-3 py-1.5 text-left",
        "transition-all duration-150 ease-out",
        // Interactive states
        "hover:bg-muted/60 active:bg-muted",
        "focus-visible:outline-none focus-visible:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        // Selected state
        selected && "bg-primary/8 hover:bg-primary/12",
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
        className
      )}
    >
      {/* Icon */}
      {icon && (
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            "bg-muted/80 text-muted-foreground",
            selected && "bg-primary/15 text-primary"
          )}
        >
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-[0.6875rem] leading-tight font-medium text-foreground truncate",
            selected && "text-primary"
          )}
        >
          {label}
        </div>
        {description && (
          <div className="text-[0.625rem] leading-tight text-muted-foreground truncate mt-0.5">
            {description}
          </div>
        )}
      </div>

      {/* Suffix or check indicator */}
      {suffix && !selected && (
        <div className="shrink-0 text-xs text-muted-foreground">{suffix}</div>
      )}
      {selected && (
        <CheckCircle
          className="size-4 shrink-0 fill-primary text-primary-foreground"
          weight="fill"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// =============================================================================
// PickerOptionCompact - Simpler single-line option
// =============================================================================

interface PickerOptionCompactProps {
  /** Main label text */
  label: string;
  /** Optional icon element */
  icon?: React.ReactNode;
  /** Optional right-side content */
  suffix?: React.ReactNode;
  /** Whether this option is currently selected */
  selected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Whether option is disabled */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

export function PickerOptionCompact({
  label,
  icon,
  suffix,
  selected = false,
  onClick,
  disabled = false,
  className,
}: PickerOptionCompactProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Base styles
        "flex items-center justify-between gap-2 w-full px-3 py-1.5 text-left",
        "transition-all duration-150 ease-out rounded-md mx-1.5",
        "first:mt-1 last:mb-1",
        // Interactive states
        "hover:bg-muted/60 active:bg-muted",
        "focus-visible:outline-none focus-visible:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring",
        // Selected state
        selected && "bg-muted",
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
        // Reduce horizontal padding to account for margin
        "!px-2",
        className
      )}
      style={{ width: "calc(100% - 0.75rem)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && <div className="shrink-0 text-muted-foreground">{icon}</div>}
        <span className="text-xs font-medium truncate">{label}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {suffix && (
          <span className="text-overline font-mono text-muted-foreground">
            {suffix}
          </span>
        )}
        {selected && (
          <CheckCircle
            className="size-4 fill-primary text-primary-foreground"
            weight="fill"
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}

// =============================================================================
// PickerDivider - Visual separator between sections
// =============================================================================

export function PickerDivider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border/40 my-1", className)} />;
}

// =============================================================================
// PickerBody - Wrapper for picker content with consistent padding
// =============================================================================

interface PickerBodyProps {
  children: React.ReactNode;
  className?: string;
  /** Remove default padding */
  noPadding?: boolean;
}

export function PickerBody({
  children,
  className,
  noPadding = false,
}: PickerBodyProps) {
  return (
    <div className={cn(!noPadding && "p-3", "stack-md", className)}>
      {children}
    </div>
  );
}

// =============================================================================
// PickerFooter - Footer area for actions like reset
// =============================================================================

interface PickerFooterProps {
  children: React.ReactNode;
  className?: string;
  /** Add top border */
  bordered?: boolean;
}

export function PickerFooter({
  children,
  className,
  bordered = true,
}: PickerFooterProps) {
  return (
    <div
      className={cn(
        "px-3 py-2.5 flex items-center justify-center",
        bordered && "border-t border-border/40",
        className
      )}
    >
      {children}
    </div>
  );
}

// =============================================================================
// PickerDescription - Help text for picker content
// =============================================================================

interface PickerDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function PickerDescription({
  children,
  className,
}: PickerDescriptionProps) {
  return (
    <p className={cn("text-overline text-muted-foreground px-3", className)}>
      {children}
    </p>
  );
}

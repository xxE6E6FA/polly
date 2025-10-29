import { cn } from "@/lib/utils";

type SpinnerProps = {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "default" | "primary" | "white";
};

export const Spinner = ({
  className,
  size = "md",
  variant = "default",
}: SpinnerProps) => {
  const sizeClasses = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const strokeWidthClasses = {
    xs: "1.5",
    sm: "2",
    md: "2.5",
    lg: "3",
  } as const;

  const variantClasses = {
    default: "text-primary",
    primary: "text-primary-foreground",
    white: "text-white",
  };

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      <svg
        className={cn(
          "animate-spin",
          sizeClasses[size],
          variantClasses[variant]
        )}
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={strokeWidthClasses[size]}
        />
        <path
          className="opacity-75"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
};

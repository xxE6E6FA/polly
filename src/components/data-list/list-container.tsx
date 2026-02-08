import { cn } from "@/lib/utils";

interface ListContainerProps {
  children: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const ListContainer = ({
  children,
  className,
  ref,
}: ListContainerProps) => {
  return (
    <div ref={ref} className={cn("overflow-visible", className)}>
      {children}
    </div>
  );
};

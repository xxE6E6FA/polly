import { cn } from "@/lib/utils";

interface SkeletonTextProps {
  className?: string;
}

export function SkeletonText({ className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {/* First paragraph */}
      <div className="space-y-2">
        <div className="h-4 bg-gradient-to-r from-[hsl(220_95%_55%/0.2)] via-[hsl(240_90%_58%/0.2)] to-[hsl(260_85%_60%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x" />
        <div className="h-4 bg-gradient-to-r from-[hsl(260_85%_60%/0.2)] via-[hsl(270_80%_63%/0.2)] to-[hsl(280_75%_65%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:0.2s]" />
        <div className="h-4 w-4/5 bg-gradient-to-r from-[hsl(240_90%_58%/0.2)] via-[hsl(260_85%_60%/0.2)] to-[hsl(220_95%_55%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:0.4s]" />
      </div>

      {/* Second paragraph */}
      <div className="space-y-2">
        <div className="h-4 w-3/4 bg-gradient-to-r from-[hsl(280_75%_65%/0.2)] via-[hsl(260_85%_60%/0.2)] to-[hsl(240_90%_58%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:0.6s]" />
        <div className="h-4 bg-gradient-to-r from-[hsl(220_95%_55%/0.2)] via-[hsl(260_85%_60%/0.2)] to-[hsl(280_75%_65%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:0.8s]" />
        <div className="h-4 w-5/6 bg-gradient-to-r from-[hsl(260_85%_60%/0.2)] via-[hsl(240_90%_58%/0.2)] to-[hsl(220_95%_55%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:1s]" />
      </div>

      {/* Third paragraph */}
      <div className="space-y-2">
        <div className="h-4 bg-gradient-to-r from-[hsl(240_90%_58%/0.2)] via-[hsl(260_85%_60%/0.2)] to-[hsl(280_75%_65%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:1.2s]" />
        <div className="h-4 w-2/3 bg-gradient-to-r from-[hsl(220_95%_55%/0.2)] via-[hsl(240_90%_58%/0.2)] to-[hsl(260_85%_60%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:1.4s]" />
      </div>

      {/* Fourth paragraph */}
      <div className="space-y-2">
        <div className="h-4 w-4/5 bg-gradient-to-r from-[hsl(280_75%_65%/0.2)] via-[hsl(260_85%_60%/0.2)] to-[hsl(240_90%_58%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:1.6s]" />
        <div className="h-4 bg-gradient-to-r from-[hsl(260_85%_60%/0.2)] via-[hsl(270_80%_63%/0.2)] to-[hsl(280_75%_65%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:1.8s]" />
        <div className="h-4 w-3/4 bg-gradient-to-r from-[hsl(220_95%_55%/0.2)] via-[hsl(260_85%_60%/0.2)] to-[hsl(280_75%_65%/0.2)] rounded bg-[length:200%_100%] animate-gradient-x [animation-delay:2s]" />
      </div>
    </div>
  );
}

import { CaretDownIcon, WarningIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NoModelsStateComponent = () => (
  <Tooltip open>
    <TooltipTrigger>
      <Button
        disabled
        variant="ghost"
        className={cn(
          "h-7 w-auto gap-1 px-2 py-1 text-xs font-medium sm:h-8 sm:gap-2 sm:px-3 sm:text-sm text-muted-foreground/60 group disabled:opacity-60"
        )}
      >
        <div className="flex items-center gap-1.5">
          <WarningIcon className="h-3.5 w-3.5 text-warning/50" />
          <span className="font-medium">Configure models</span>
          <CaretDownIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        </div>
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      Go to Settings → Models to load available models
    </TooltipContent>
  </Tooltip>
);

export const NoModelsState = memo(NoModelsStateComponent);

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import type { ModelForCapabilities } from "@/types";

interface MultiModelSelectorProps {
  onCompare: (
    models: Array<{
      modelId: string;
      provider: string;
      name: string;
    }>
  ) => void;
  trigger?: React.ReactNode;
  disabled?: boolean;
}

export function MultiModelSelector({
  onCompare,
  trigger,
  disabled = false,
}: MultiModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedModels, setSelectedModels] = useState<
    Array<{
      modelId: string;
      provider: string;
      name: string;
    }>
  >([]);

  const { modelGroups } = useModelCatalog();

  // Flatten all available models
  const allModels = useMemo(() => {
    const models: ModelForCapabilities[] = [];
    models.push(...modelGroups.freeModels);
    Object.values(modelGroups.providerModels).forEach((providerModels) => {
      models.push(...providerModels);
    });
    return models;
  }, [modelGroups]);

  const handleToggleModel = useCallback(
    (modelId: string, provider: string, name: string) => {
      setSelectedModels((prev) => {
        const exists = prev.find(
          (m) => m.modelId === modelId && m.provider === provider
        );
        if (exists) {
          return prev.filter(
            (m) => !(m.modelId === modelId && m.provider === provider)
          );
        }
        return [...prev, { modelId, provider, name }];
      });
    },
    []
  );

  const isSelected = useCallback(
    (modelId: string, provider: string) => {
      return selectedModels.some(
        (m) => m.modelId === modelId && m.provider === provider
      );
    },
    [selectedModels]
  );

  const handleCompare = useCallback(() => {
    if (selectedModels.length >= 2) {
      onCompare(selectedModels);
      setOpen(false);
      setSelectedModels([]);
    }
  }, [selectedModels, onCompare]);

  const layout = selectedModels.length === 2 ? "split" : "tabs";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger || (
          <Button variant="outline" size="sm">
            Compare Models
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Compare Multiple Models</DialogTitle>
          <DialogDescription>
            Select 2 or more models to compare their responses side by side.
            {selectedModels.length >= 2 && (
              <span className="block mt-2 text-sm text-foreground">
                Layout:{" "}
                <span className="font-medium">
                  {layout === "split" ? "Split View" : "Tabs"}
                </span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="stack-md">
            {/* Free Models */}
            {modelGroups.freeModels.length > 0 && (
              <div className="stack-sm">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Free Models
                </h3>
                <div className="stack-xs">
                  {modelGroups.freeModels.map((model) => (
                    <button
                      key={`${model.provider}-${model.modelId}`}
                      onClick={() =>
                        handleToggleModel(
                          model.modelId,
                          model.provider,
                          model.name
                        )
                      }
                      className={cn(
                        "flex items-center justify-between w-full p-3 rounded-lg border transition-colors",
                        isSelected(model.modelId, model.provider)
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-accent"
                      )}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">
                          {model.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {model.provider}
                        </span>
                      </div>
                      {isSelected(model.modelId, model.provider) && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Provider Models */}
            {Object.entries(modelGroups.providerModels).map(
              ([provider, models]) =>
                models.length > 0 && (
                  <div key={provider} className="stack-sm">
                    <h3 className="text-sm font-medium text-muted-foreground capitalize">
                      {provider}
                    </h3>
                    <div className="stack-xs">
                      {models.map((model) => (
                        <button
                          key={`${model.provider}-${model.modelId}`}
                          onClick={() =>
                            handleToggleModel(
                              model.modelId,
                              model.provider,
                              model.name
                            )
                          }
                          className={cn(
                            "flex items-center justify-between w-full p-3 rounded-lg border transition-colors",
                            isSelected(model.modelId, model.provider)
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-accent"
                          )}
                        >
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium">
                              {model.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {model.provider}
                            </span>
                          </div>
                          {isSelected(model.modelId, model.provider) && (
                            <Check className="w-5 h-5 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {selectedModels.length} model{selectedModels.length !== 1 ? "s" : ""}{" "}
            selected
          </p>
          <Button
            onClick={handleCompare}
            disabled={selectedModels.length < 2}
          >
            Compare Models
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

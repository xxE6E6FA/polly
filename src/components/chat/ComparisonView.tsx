import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChatMessage } from "@/types";
import { ChatMessage as ChatMessageComponent } from "@/components/chat-message";
import { Badge } from "@/components/ui/badge";

interface ComparisonViewModel {
  modelId: string;
  provider: string;
  name?: string;
}

interface ComparisonViewProps {
  models: ComparisonViewModel[];
  messages: ChatMessage[];
  layout?: "split" | "tabs";
  onRetry?: (messageId: string, modelId?: string, provider?: string) => void;
  onDelete?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  className?: string;
}

export function ComparisonView({
  models,
  messages,
  layout = "tabs",
  onRetry,
  onDelete,
  onCopy,
  className,
}: ComparisonViewProps) {
  const [activeTab, setActiveTab] = useState(models[0]?.modelId || "");

  // Group messages by model
  const messagesByModel = useMemo(() => {
    const grouped = new Map<string, ChatMessage[]>();

    // Initialize with empty arrays for each model
    models.forEach((model) => {
      grouped.set(model.modelId, []);
    });

    // Group assistant messages by model, include all user messages in all groups
    messages.forEach((message) => {
      if (message.role === "user") {
        // Add user messages to all model groups
        models.forEach((model) => {
          const modelMessages = grouped.get(model.modelId) || [];
          modelMessages.push(message);
        });
      } else if (message.role === "assistant" && message.model) {
        // Add assistant messages only to their respective model group
        const modelMessages = grouped.get(message.model) || [];
        modelMessages.push(message);
        grouped.set(message.model, modelMessages);
      }
    });

    return grouped;
  }, [messages, models]);

  // Get model name for display
  const getModelName = (modelId: string) => {
    const model = models.find((m) => m.modelId === modelId);
    return model?.name || modelId;
  };

  // Split view for 2 models
  if (layout === "split" && models.length === 2) {
    return (
      <div className={cn("flex gap-4 h-full", className)}>
        {models.map((model, index) => {
          const modelMessages = messagesByModel.get(model.modelId) || [];
          return (
            <div
              key={model.modelId}
              className={cn(
                "flex-1 flex flex-col border-border overflow-hidden",
                index === 0 && "border-r"
              )}
            >
              {/* Model header */}
              <div className="sticky top-0 z-sticky bg-background border-b border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {getModelName(model.modelId)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {model.provider}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {modelMessages.filter((m) => m.role === "assistant").length}{" "}
                    responses
                  </Badge>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="stack-md">
                  {modelMessages.map((message) => (
                    <ChatMessageComponent
                      key={message.id}
                      message={message}
                      onRetry={
                        onRetry
                          ? () => onRetry(message.id, model.modelId, model.provider)
                          : undefined
                      }
                      onDelete={onDelete ? () => onDelete(message.id) : undefined}
                      onCopy={onCopy}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Tabbed view for >2 models or when explicitly requested
  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn("flex flex-col h-full", className)}
    >
      <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
        {models.map((model) => {
          const modelMessages = messagesByModel.get(model.modelId) || [];
          const responseCount = modelMessages.filter(
            (m) => m.role === "assistant"
          ).length;

          return (
            <TabsTrigger
              key={model.modelId}
              value={model.modelId}
              className="flex items-center gap-2 rounded-none border-b-2 data-[state=active]:border-primary"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">
                  {getModelName(model.modelId)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {model.provider}
                </span>
              </div>
              <Badge variant="outline" className="text-xs ml-2">
                {responseCount}
              </Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {models.map((model) => {
        const modelMessages = messagesByModel.get(model.modelId) || [];
        return (
          <TabsContent
            key={model.modelId}
            value={model.modelId}
            className="flex-1 overflow-y-auto p-4 mt-0"
          >
            <div className="stack-md">
              {modelMessages.map((message) => (
                <ChatMessageComponent
                  key={message.id}
                  message={message}
                  onRetry={
                    onRetry
                      ? () => onRetry(message.id, model.modelId, model.provider)
                      : undefined
                  }
                  onDelete={onDelete ? () => onDelete(message.id) : undefined}
                  onCopy={onCopy}
                />
              ))}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

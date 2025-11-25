import { DotsThreeVerticalIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DataListColumn } from "./DataList";
import {
  DataListMobileDrawer,
  type MobileDrawerConfig,
} from "./DataListMobileDrawer";

interface DataListMobileRowProps<TItem, TField extends string> {
  item: TItem;
  columns: DataListColumn<TItem, TField>[];
  mobileTitleRender?: (item: TItem) => React.ReactNode;
  mobileMetadataRender?: (item: TItem) => React.ReactNode;
  mobileDrawerConfig?: MobileDrawerConfig<TItem>;
  onRowClick?: (item: TItem) => void;
}

export function DataListMobileRow<TItem, TField extends string>({
  item,
  columns,
  mobileTitleRender,
  mobileMetadataRender,
  mobileDrawerConfig,
  onRowClick,
}: DataListMobileRowProps<TItem, TField>) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Get visible actions (non-hidden)
  const visibleActions =
    mobileDrawerConfig?.actions.filter(action => !action.hidden?.(item)) ?? [];
  const hasSingleAction = visibleActions.length === 1;
  const singleAction = hasSingleAction ? visibleActions[0] : null;

  const handleRowClick = () => {
    if (mobileDrawerConfig?.openOnRowTap !== false && mobileDrawerConfig) {
      // If single action, execute it directly instead of opening drawer
      if (singleAction && !singleAction.toggle) {
        singleAction.onClick(item);
      } else {
        setIsDrawerOpen(true);
      }
    } else if (onRowClick) {
      onRowClick(item);
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (singleAction && !singleAction.toggle) {
      singleAction.onClick(item);
    } else {
      setIsDrawerOpen(true);
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (singleAction && !singleAction.toggle) {
        singleAction.onClick(item);
      } else {
        setIsDrawerOpen(true);
      }
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick();
    }
  };

  // Render single action button inline
  const renderSingleActionButton = () => {
    if (!singleAction) {
      return null;
    }
    const Icon = singleAction.icon;
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-8 w-8"
        onClick={handleTriggerClick}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  };

  // Render menu trigger for multiple actions
  const renderMenuTrigger = () => {
    if (mobileDrawerConfig?.triggerRender) {
      return (
        <div
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          role="button"
          tabIndex={0}
        >
          {mobileDrawerConfig.triggerRender(item)}
        </div>
      );
    }
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-8 w-8"
        onClick={handleTriggerClick}
      >
        <DotsThreeVerticalIcon className="h-4 w-4" weight="bold" />
      </Button>
    );
  };

  return (
    <>
      <div
        className="lg:hidden flex flex-col gap-2 w-full"
        style={{ gridColumn: "1 / -1" }}
        onClick={mobileDrawerConfig ? handleRowClick : undefined}
        onKeyDown={mobileDrawerConfig ? handleRowKeyDown : undefined}
        role={mobileDrawerConfig ? "button" : undefined}
        tabIndex={mobileDrawerConfig ? 0 : undefined}
      >
        {/* Mobile Header with Title and Actions */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {mobileTitleRender
              ? mobileTitleRender(item)
              : columns[0]?.render(item)}
          </div>

          {/* Action trigger - single action button or menu */}
          {mobileDrawerConfig && visibleActions.length > 0 && (
            <div className="flex-shrink-0">
              {hasSingleAction && !singleAction?.toggle
                ? renderSingleActionButton()
                : renderMenuTrigger()}
            </div>
          )}
        </div>

        {/* Mobile Metadata */}
        {mobileMetadataRender && <div>{mobileMetadataRender(item)}</div>}

        {/* Mobile Content (columns with labels) - only if no metadata render */}
        {!mobileMetadataRender && (
          <div className="stack-2">
            {columns.slice(1).map(column => {
              if (column.hideOnMobile) {
                return null;
              }

              const content = column.mobileRender
                ? column.mobileRender(item)
                : column.render(item);

              return (
                <div key={column.key} className="flex flex-col gap-0.5">
                  {!column.hideLabelOnMobile && (
                    <span className="text-xs text-muted-foreground font-medium">
                      {column.label}
                    </span>
                  )}
                  <div>{content}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawer for mobile actions - only needed for multiple actions or toggle */}
      {mobileDrawerConfig && (!hasSingleAction || singleAction?.toggle) && (
        <DataListMobileDrawer
          item={item}
          config={mobileDrawerConfig}
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
        />
      )}
    </>
  );
}

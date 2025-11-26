import { DotsThreeVerticalIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DataListMobileDrawer,
  type MobileDrawerConfig,
} from "./DataListMobileDrawer";
import type { VirtualizedDataListColumn } from "./VirtualizedDataList";

interface DataListMobileRowProps<TItem, TField extends string> {
  item: TItem;
  columns: VirtualizedDataListColumn<TItem, TField>[];
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

  // Separate toggle action from other actions
  // Toggle is always shown inline, other actions go in drawer/menu
  const toggleAction = visibleActions.find(action => action.toggle);
  const nonToggleActions = visibleActions.filter(action => !action.toggle);
  const hasSingleNonToggleAction = nonToggleActions.length === 1;
  const singleNonToggleAction = hasSingleNonToggleAction
    ? nonToggleActions[0]
    : null;

  const handleRowClick = () => {
    if (mobileDrawerConfig?.openOnRowTap !== false && mobileDrawerConfig) {
      // If single non-toggle action, execute it directly
      if (singleNonToggleAction) {
        singleNonToggleAction.onClick(item);
      } else if (nonToggleActions.length > 1) {
        setIsDrawerOpen(true);
      }
    } else if (onRowClick) {
      onRowClick(item);
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (singleNonToggleAction) {
      singleNonToggleAction.onClick(item);
    } else {
      setIsDrawerOpen(true);
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (singleNonToggleAction) {
        singleNonToggleAction.onClick(item);
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

  // Render single non-toggle action button inline
  const renderSingleActionButton = () => {
    if (!singleNonToggleAction) {
      return null;
    }
    const Icon = singleNonToggleAction.icon;
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

  // Render toggle action inline (always shown if present)
  const renderInlineToggle = () => {
    if (!toggleAction?.toggle) {
      return null;
    }
    return (
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <Switch
          checked={toggleAction.toggle.checked(item)}
          onCheckedChange={checked => {
            toggleAction.toggle?.onCheckedChange(item, checked);
          }}
        />
      </div>
    );
  };

  // Render menu trigger for multiple actions
  const renderMenuTrigger = () => {
    if (mobileDrawerConfig?.triggerRender) {
      return (
        <button
          type="button"
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          className="bg-transparent border-0 p-0 cursor-pointer"
        >
          {mobileDrawerConfig.triggerRender(item)}
        </button>
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
        onClick={mobileDrawerConfig ? handleRowClick : undefined}
        onKeyDown={mobileDrawerConfig ? handleRowKeyDown : undefined}
        role={mobileDrawerConfig ? "button" : undefined}
        tabIndex={mobileDrawerConfig ? 0 : undefined}
      >
        {/* Mobile Header with Title and Actions */}
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0 overflow-hidden">
            {mobileTitleRender
              ? mobileTitleRender(item)
              : columns[0]?.render(item)}
          </div>

          {/* Action trigger - toggle inline + overflow menu for other actions */}
          {mobileDrawerConfig && visibleActions.length > 0 && (
            <div className="flex items-center gap-1">
              {/* Toggle is always shown inline if present */}
              {toggleAction && renderInlineToggle()}
              {/* Non-toggle actions: single button or overflow menu */}
              {hasSingleNonToggleAction && renderSingleActionButton()}
              {nonToggleActions.length > 1 && renderMenuTrigger()}
            </div>
          )}
        </div>

        {/* Mobile Metadata */}
        {mobileMetadataRender && (
          <div className="w-fit">{mobileMetadataRender(item)}</div>
        )}

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

      {/* Drawer for mobile actions - only needed for multiple non-toggle actions */}
      {mobileDrawerConfig && nonToggleActions.length > 1 && (
        <DataListMobileDrawer
          item={item}
          config={{
            ...mobileDrawerConfig,
            // Only show non-toggle actions in drawer (toggle is inline)
            actions: mobileDrawerConfig.actions.filter(
              action => !action.toggle
            ),
          }}
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
        />
      )}
    </>
  );
}

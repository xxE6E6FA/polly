import { ChatTextIcon, ImageIcon } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router";
import { SettingsPageLayout } from "../ui/SettingsPageLayout";
import { ImageModelsTab } from "./ImageModelsTab";
import { TextModelsTab } from "./TextModelsTab";

// Re-export types
export type { FilterState } from "./TextModelsTab";

export const ModelsTab = () => {
  const location = useLocation();
  const activeTab = location.pathname.includes("/image") ? "image" : "text";

  const tabs = [
    {
      id: "text" as const,
      label: "Text Models",
      icon: <ChatTextIcon className="h-4 w-4" />,
      href: "/settings/models/text",
    },
    {
      id: "image" as const,
      label: "Image Models",
      icon: <ImageIcon className="h-4 w-4" />,
      href: "/settings/models/image",
    },
  ];

  return (
    <SettingsPageLayout>
      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <Link
              key={tab.id}
              to={tab.href}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "text" ? <TextModelsTab /> : <ImageModelsTab />}
      </div>
    </SettingsPageLayout>
  );
};

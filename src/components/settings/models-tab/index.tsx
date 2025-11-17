import {
  ChatTextIcon,
  ImageIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import { Link, useLocation } from "react-router-dom";
import { SettingsPageLayout } from "../ui/SettingsPageLayout";
import { ImageModelsTab } from "./ImageModelsTab";
import { TextModelsTab } from "./TextModelsTab";
import { TTSTab } from "./TTSTab";

export const ModelsTab = () => {
  const location = useLocation();
  const activeTab = (() => {
    if (location.pathname.includes("/image")) {
      return "image";
    }
    if (location.pathname.includes("/tts")) {
      return "tts";
    }
    return "text";
  })();

  const tabs = [
    {
      id: "text" as const,
      label: "Text",
      icon: <ChatTextIcon className="h-4 w-4" />,
      href: "/settings/models/text",
    },
    {
      id: "image" as const,
      label: "Image",
      icon: <ImageIcon className="h-4 w-4" />,
      href: "/settings/models/image",
    },
    {
      id: "tts" as const,
      label: "Text-to-Speech",
      icon: <SpeakerHighIcon className="h-4 w-4" />,
      href: "/settings/models/tts",
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
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
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
        {activeTab === "text" && <TextModelsTab />}
        {activeTab === "image" && <ImageModelsTab />}
        {activeTab === "tts" && <TTSTab />}
      </div>
    </SettingsPageLayout>
  );
};

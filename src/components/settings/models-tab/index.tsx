import { useLocation } from "react-router-dom";
import { ApiKeysTabContent } from "../api-keys-tab";
import { SettingsPageLayout } from "../ui/settings-page-layout";
import { ImageModelsTab } from "./image-models-tab";
import { TextModelsTab } from "./text-models-tab";
import { TTSTab } from "./tts-tab";

export const ModelsTab = () => {
  const location = useLocation();
  const activeTab = (() => {
    if (location.pathname.includes("/image")) {
      return "image";
    }
    if (location.pathname.includes("/tts")) {
      return "tts";
    }
    if (location.pathname.includes("/keys")) {
      return "keys";
    }
    return "text";
  })();

  return (
    <SettingsPageLayout>
      {activeTab === "text" && <TextModelsTab />}
      {activeTab === "image" && <ImageModelsTab />}
      {activeTab === "tts" && <TTSTab />}
      {activeTab === "keys" && <ApiKeysTabContent />}
    </SettingsPageLayout>
  );
};

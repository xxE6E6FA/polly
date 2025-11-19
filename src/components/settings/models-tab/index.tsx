import { useLocation } from "react-router-dom";
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

  return (
    <SettingsPageLayout>
      {activeTab === "text" && <TextModelsTab />}
      {activeTab === "image" && <ImageModelsTab />}
      {activeTab === "tts" && <TTSTab />}
    </SettingsPageLayout>
  );
};

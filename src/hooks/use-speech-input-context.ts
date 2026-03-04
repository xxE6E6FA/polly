import { use } from "react";
import {
  SpeechInputContext,
  type SpeechInputContextValue,
} from "@/providers/speech-input-context";

export function useSpeechInputContext(): SpeechInputContextValue {
  const context = use(SpeechInputContext);
  if (context === undefined) {
    throw new Error(
      "useSpeechInputContext must be used within a SpeechInputProvider"
    );
  }
  return context;
}

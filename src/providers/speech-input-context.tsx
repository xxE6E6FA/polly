import { createContext } from "react";

export type SpeechInputContextValue = {
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  waveform: number[];
  startRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  acceptRecording: () => Promise<void>;
};

export const SpeechInputContext = createContext<
  SpeechInputContextValue | undefined
>(undefined);

type SpeechInputProviderProps = {
  value: SpeechInputContextValue;
  children: React.ReactNode;
};

export function SpeechInputProvider({
  value,
  children,
}: SpeechInputProviderProps) {
  return (
    <SpeechInputContext.Provider value={value}>
      {children}
    </SpeechInputContext.Provider>
  );
}

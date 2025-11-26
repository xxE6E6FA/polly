import { createContext, useContext } from "react";

type SpeechInputContextValue = {
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  waveform: number[];
  startRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  acceptRecording: () => Promise<void>;
};

const SpeechInputContext = createContext<SpeechInputContextValue | undefined>(
  undefined
);

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

export function useSpeechInputContext(): SpeechInputContextValue {
  const context = useContext(SpeechInputContext);
  if (context === undefined) {
    throw new Error(
      "useSpeechInputContext must be used within a SpeechInputProvider"
    );
  }
  return context;
}

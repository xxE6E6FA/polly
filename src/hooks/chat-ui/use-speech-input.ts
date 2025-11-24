import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiKeys } from "@/lib/chat/use-api-keys";
import { useToast } from "@/providers/toast-context";

const WAVEFORM_SEGMENTS = 48;

type UseSpeechInputProps = {
  onTranscription: (text: string) => void;
};

type UseSpeechInputResult = {
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  waveform: number[];
  startRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  acceptRecording: () => Promise<void>;
};

export function useSpeechInput({
  onTranscription,
}: UseSpeechInputProps): UseSpeechInputResult {
  const { getDecryptedApiKey } = useApiKeys();
  const managedToast = useToast();
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [waveform, setWaveform] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const resolveStopRef = useRef<((blob: Blob) => void) | null>(null);
  const rejectStopRef = useRef<((error: unknown) => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const waveformBufferRef = useRef<Uint8Array | null>(null);

  const cleanupStream = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    waveformBufferRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // ignore
      });
      audioContextRef.current = null;
    }
    const stream = mediaStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    let supported = false;
    if (typeof window !== "undefined") {
      const mediaDevices = navigator.mediaDevices;
      supported =
        typeof mediaDevices !== "undefined" &&
        typeof mediaDevices.getUserMedia === "function" &&
        typeof window.MediaRecorder !== "undefined";
    }
    setIsSupported(supported);

    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  const stopRecording = useCallback(() => {
    return new Promise<Blob>((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(new Blob());
        return;
      }

      resolveStopRef.current = resolve;
      rejectStopRef.current = reject;

      try {
        recorder.stop();
      } catch (error) {
        resolveStopRef.current = null;
        rejectStopRef.current = null;
        cleanupStream();
        reject(error);
      }
    });
  }, [cleanupStream]);

  const handleRecorderStop = useCallback(() => {
    const chunks = recordedChunksRef.current;
    const recorder = mediaRecorderRef.current;
    recordedChunksRef.current = [];
    setIsRecording(false);

    const blob = new Blob(chunks, {
      type: recorder?.mimeType || "audio/webm",
    });

    cleanupStream();

    if (resolveStopRef.current) {
      resolveStopRef.current(blob);
    }
    resolveStopRef.current = null;
    rejectStopRef.current = null;
  }, [cleanupStream]);

  const handleRecorderError = useCallback(
    (event: Event) => {
      const error =
        event instanceof ErrorEvent
          ? event.error
          : new Error("Recording failed");
      recordedChunksRef.current = [];
      cleanupStream();
      setIsRecording(false);
      rejectStopRef.current?.(error);
      resolveStopRef.current = null;
      rejectStopRef.current = null;
    },
    [cleanupStream]
  );

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      managedToast.error("Microphone not supported in this browser");
      return;
    }
    if (isRecording || isTranscribing || mediaRecorderRef.current) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 44100,
        },
      });
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.28;
      analyserRef.current = analyser;
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(audioContext.destination);
      const buffer: Uint8Array = new Uint8Array(
        new ArrayBuffer(analyser.fftSize)
      );
      waveformBufferRef.current = buffer;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : undefined,
        audioBitsPerSecond: 128000,
      });
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      setWaveform([]);

      recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", handleRecorderStop, { once: true });
      recorder.addEventListener("error", handleRecorderError, { once: true });

      const updateWaveform = () => {
        const buffer = waveformBufferRef.current;
        const analyserNode = analyserRef.current;
        if (!(buffer && analyserNode)) {
          return;
        }
        // @ts-expect-error - TypeScript's Web Audio API types are overly strict
        // The buffer is a valid Uint8Array created with ArrayBuffer
        analyserNode.getByteTimeDomainData(buffer);
        const segmentSize = Math.max(
          1,
          Math.floor(buffer.length / WAVEFORM_SEGMENTS)
        );
        const nextWaveform: number[] = [];

        for (let i = 0; i < WAVEFORM_SEGMENTS; i += 1) {
          const start = i * segmentSize;
          let peak = 0;
          let energy = 0;
          let count = 0;
          for (let j = 0; j < segmentSize; j += 1) {
            const sample = buffer[start + j];
            if (sample === undefined) {
              continue;
            }
            const normalized = Math.abs(sample - 128) / 128;
            if (normalized > peak) {
              peak = normalized;
            }
            energy += normalized * normalized;
            count += 1;
          }
          const rms = count > 0 ? Math.sqrt(energy / count) : 0;
          const adjustedPeak = Math.max(0, peak - 0.035);
          const adjustedRms = Math.max(0, rms - 0.025);
          const mixed = adjustedPeak * 0.5 + adjustedRms * 0.5;
          const scaled = Math.min(1, mixed * 3.4);
          const dynamic = scaled ** 0.48;
          const gated = dynamic < 0.02 ? 0 : dynamic;
          nextWaveform.push(gated);
        }

        setWaveform(previous => {
          if (previous.length === nextWaveform.length) {
            const smoothed = nextWaveform.map((value, index) => {
              const current = previous[index] ?? 0;
              const delta = value - current;
              const response = delta > 0 ? 0.55 : 0.35;
              return current + delta * response;
            });
            const shouldUpdate = smoothed.some((value, index) => {
              const current = previous[index] ?? 0;
              return Math.abs(value - current) > 0.0025;
            });
            return shouldUpdate ? smoothed : previous;
          }

          return nextWaveform;
        });

        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      updateWaveform();
      recorder.start(125);
      setIsRecording(true);
    } catch (error) {
      cleanupStream();
      const message =
        error instanceof Error ? error.message : "Unable to access microphone";
      managedToast.error(message);
    }
  }, [
    cleanupStream,
    handleRecorderError,
    handleRecorderStop,
    isRecording,
    isSupported,
    isTranscribing,
    managedToast,
  ]);

  const cancelRecording = useCallback(async () => {
    if (!(isRecording && mediaRecorderRef.current)) {
      return;
    }
    try {
      await stopRecording();
    } catch {
      // ignore errors during cancel
    } finally {
      recordedChunksRef.current = [];
      cleanupStream();
      setIsRecording(false);
      setWaveform([]);
      waveformBufferRef.current = null;
    }
  }, [cleanupStream, isRecording, stopRecording]);

  const acceptRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) {
      return;
    }

    let audioBlob: Blob;
    try {
      audioBlob = await stopRecording();
    } catch {
      managedToast.error("Failed to capture audio");
      return;
    }

    if (audioBlob.size === 0) {
      managedToast.error("No audio captured");
      return;
    }

    setIsTranscribing(true);
    try {
      const apiKey = await getDecryptedApiKey({
        provider: "openai",
        modelId: "whisper-1",
      });

      if (!apiKey) {
        managedToast.error("Add an OpenAI API key to use voice input");
        return;
      }

      const buffer = await audioBlob.arrayBuffer();
      const openai = createOpenAI({ apiKey });
      const result = await transcribe({
        model: openai.transcription("whisper-1"),
        audio: new Uint8Array(buffer),
      });

      const text = result.text?.trim();
      if (!text) {
        managedToast.error("Unable to transcribe audio");
        return;
      }

      onTranscription(text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to transcribe audio";
      managedToast.error(message);
    } finally {
      setIsTranscribing(false);
      recordedChunksRef.current = [];
      cleanupStream();
      setWaveform([]);
      waveformBufferRef.current = null;
    }
  }, [
    cleanupStream,
    getDecryptedApiKey,
    managedToast,
    onTranscription,
    stopRecording,
  ]);

  return {
    isSupported,
    isRecording,
    isTranscribing,
    waveform,
    startRecording,
    cancelRecording,
    acceptRecording,
  };
}

import { CheckIcon, MicrophoneIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SpeechInputButtonProps = {
  disabled: boolean;
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  waveform: number[];
  onStart: () => void;
  onCancel: () => void;
  onSubmit: () => void;
};

const WRAPPER_BASE = [
  "flex h-8 items-center gap-1.5 overflow-hidden rounded-full",
  "transition-colors duration-200 ease-out",
].join(" ");

type ButtonState = "idle" | "recording" | "transcribing";

const ACTIVE_STATE_STYLE = "bg-primary/10 text-primary shadow-sm opacity-100";

const STATE_LAYOUT: Record<ButtonState, string> = {
  recording: "justify-end",
  transcribing: "justify-end",
  idle: "w-[72px] justify-end",
};

const STATE_STYLE: Record<ButtonState, string> = {
  recording: ACTIVE_STATE_STYLE,
  transcribing: ACTIVE_STATE_STYLE,
  idle: "bg-transparent text-foreground opacity-70",
};

const ACTION_BASE = [
  "flex h-8 w-8 items-center justify-center",
  "transition-colors duration-200 ease-out",
].join(" ");

const CancelRecordingButton = ({ onCancel }: { onCancel: () => void }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="h-8 w-8 rounded-full text-primary hover:bg-primary/15"
        onClick={onCancel}
        aria-label="Discard recording"
      >
        <XIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <div className="text-xs">Discard recording</div>
    </TooltipContent>
  </Tooltip>
);

const AcceptTranscriptButton = ({ onSubmit }: { onSubmit: () => void }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={onSubmit}
        aria-label="Use transcript"
      >
        <CheckIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <div className="text-xs">Use transcript</div>
    </TooltipContent>
  </Tooltip>
);

const StartRecordingButton = ({
  disabled,
  onStart,
}: {
  disabled: boolean;
  onStart: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={disabled}
        onClick={onStart}
        aria-label="Start voice input"
      >
        <MicrophoneIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <div className="text-xs">Start voice input</div>
    </TooltipContent>
  </Tooltip>
);

type RecordingWaveformProps = {
  data: number[];
};

const RecordingWaveform = ({ data }: RecordingWaveformProps) => {
  const hasSamples = data.length > 0;
  const barCount = 24;

  const bars = Array.from({ length: barCount }, (_, index) => {
    if (!hasSamples) {
      const progress = index / Math.max(1, barCount - 1);
      const wave = Math.sin(Math.PI * progress);
      const normalized = (wave + 1) / 2;
      const smoothed = normalized ** 0.8;
      return 0.28 + smoothed * 0.24;
    }

    const segmentSize = data.length / barCount;
    const start = Math.floor(index * segmentSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * segmentSize));

    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const sample = Math.abs(data[sampleIndex] ?? 0);
      if (sample > peak) {
        peak = sample;
      }
    }

    if (peak < 0.025) {
      return 0.15;
    }

    const amplified = Math.min(1.1, peak * 4.0);
    const curved = amplified ** 0.55;
    return Math.min(1, Math.max(0.15, curved));
  });

  return (
    <div
      className="flex h-8 items-center justify-end gap-1 px-3 py-1.5"
      aria-hidden="true"
    >
      {bars.map((value, index) => {
        const height = `${Math.min(1, value) * 100}%`;
        const opacity = 0.5 + value * 0.5;
        const barId = `bar-${index}-${Math.floor(value * 1000)}`;

        return (
          <div
            key={barId}
            className="flex h-full w-1 items-center justify-center transition-all duration-500 ease-in-out"
          >
            <div
              className="w-full rounded-full bg-primary transition-all duration-500 ease-in-out"
              style={{ height, opacity }}
            />
          </div>
        );
      })}
    </div>
  );
};

const getPrimaryAction = ({
  state,
  disabled,
  onStart,
  onSubmit,
}: {
  state: ButtonState;
  disabled: boolean;
  onStart: () => void;
  onSubmit: () => void;
}): ReactNode => {
  if (state === "recording") {
    return <AcceptTranscriptButton onSubmit={onSubmit} />;
  }

  if (state === "transcribing") {
    return null;
  }

  return <StartRecordingButton disabled={disabled} onStart={onStart} />;
};

export function SpeechInputButton({
  disabled,
  isSupported,
  isRecording,
  isTranscribing,
  waveform,
  onStart,
  onCancel,
  onSubmit,
}: SpeechInputButtonProps) {
  if (!isSupported) {
    return <div className="h-8 w-[132px]" aria-hidden="true" />;
  }

  const state: ButtonState = (() => {
    if (isRecording) {
      return "recording";
    }
    if (isTranscribing) {
      return "transcribing";
    }
    return "idle";
  })();

  const primaryAction = getPrimaryAction({
    state,
    disabled,
    onStart,
    onSubmit,
  });

  return (
    <div className={cn(WRAPPER_BASE, STATE_LAYOUT[state], STATE_STYLE[state])}>
      {state === "recording" && (
        <div className="flex items-center">
          <RecordingWaveform data={waveform} />
        </div>
      )}
      {state === "recording" && (
        <div className={cn(ACTION_BASE, "opacity-100")}>
          <CancelRecordingButton onCancel={onCancel} />
        </div>
      )}
      {state === "transcribing" && (
        <div className="flex items-center gap-2 px-2">
          <Spinner size="xs" variant="default" />
          <span className="text-xs text-primary">Transcribing...</span>
        </div>
      )}
      {primaryAction && <div className={ACTION_BASE}>{primaryAction}</div>}
    </div>
  );
}

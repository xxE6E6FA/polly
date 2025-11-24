type RecordingWaveformProps = {
  data: number[];
};

export const RecordingWaveform = ({ data }: RecordingWaveformProps) => {
  const hasSamples = data.length > 0;
  const barCount = 12;

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
      className="flex h-8 items-center justify-end gap-0.5 px-2 py-1.5"
      aria-hidden="true"
    >
      {bars.map((value, index) => {
        const height = `${Math.min(1, value) * 100}%`;
        const opacity = 0.5 + value * 0.5;
        const barId = `bar-${index}-${Math.floor(value * 1000)}`;

        return (
          <div
            key={barId}
            className="flex h-full w-0.5 items-center justify-center transition-all duration-500 ease-in-out"
          >
            <div
              className="w-full rounded-full bg-primary-foreground transition-all duration-500 ease-in-out"
              style={{ height, opacity }}
            />
          </div>
        );
      })}
    </div>
  );
};

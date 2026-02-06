// File processing constants

export const FILE_LIMITS = {
  MAX_SIZE_BYTES: 20 * 1024 * 1024, // 20MB (default for images and text files)
  PDF_MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB (larger limit for PDFs)
  AUDIO_MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB for audio files
  VIDEO_MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB for video files
  MAX_DIMENSION: 1024,
  THUMBNAIL_SIZE: 200,
  IMAGE_QUALITY: 0.8,
} as const;

export const BATCH_PROCESSING = {
  SIZE: 20,
  TIMEOUT_MS: 75,
  CHECK_INTERVAL_MS: 500,
} as const;

// Categorized MIME type sets for validation and accept attribute generation
export const MIME_TYPES = {
  IMAGE: new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/heic",
    "image/heif",
  ]),
  PDF: new Set(["application/pdf"]),
  TEXT: new Set([
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    "text/css",
    "text/javascript",
    "text/typescript",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/yaml",
    "application/x-yaml",
  ]),
  AUDIO: new Set([
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/mp4",
    "audio/flac",
    "audio/aac",
  ]),
  VIDEO: new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]),
} as const;

export const FILE_EXTENSIONS = {
  TEXT: ["txt", "text", "md", "markdown", "mdx", "rtf", "log", "csv", "tsv"],
  CODE: [
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "c",
    "cpp",
    "cs",
    "php",
    "rb",
    "go",
    "rs",
    "swift",
    "html",
    "css",
    "json",
    "xml",
    "yaml",
    "sql",
    "sh",
  ],
  IMAGE: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic", "heif"],
  PDF: ["pdf"],
  AUDIO: ["mp3", "wav", "ogg", "webm", "flac", "aac", "m4a"],
  VIDEO: ["mp4", "webm", "ogv", "mov"],
} as const;

// Pre-computed extension sets for fast lookup
export const TEXT_EXTENSIONS: Set<string> = new Set([
  ...FILE_EXTENSIONS.TEXT,
  ...FILE_EXTENSIONS.CODE,
]);
export const AUDIO_EXTENSIONS: Set<string> = new Set(FILE_EXTENSIONS.AUDIO);
export const VIDEO_EXTENSIONS: Set<string> = new Set(FILE_EXTENSIONS.VIDEO);

// Union of all allowed MIME types (for backend validation)
export function getAllowedMimeTypes(): Set<string> {
  const all = new Set<string>();
  for (const mimeSet of Object.values(MIME_TYPES)) {
    for (const mime of mimeSet) {
      all.add(mime);
    }
  }
  return all;
}

type SupportedTypeOptions = {
  image?: boolean;
  pdf?: boolean;
  text?: boolean;
  audio?: boolean;
  video?: boolean;
};

/**
 * Build an HTML `accept` attribute string from supported type options.
 */
export function buildAcceptAttribute(options: SupportedTypeOptions): string {
  const parts: string[] = [];

  if (options.image) {
    parts.push("image/*");
  }
  if (options.pdf) {
    parts.push(".pdf");
  }
  if (options.text) {
    for (const ext of FILE_EXTENSIONS.TEXT) {
      parts.push(`.${ext}`);
    }
    for (const ext of FILE_EXTENSIONS.CODE) {
      parts.push(`.${ext}`);
    }
  }
  if (options.audio) {
    for (const ext of FILE_EXTENSIONS.AUDIO) {
      parts.push(`.${ext}`);
    }
  }
  if (options.video) {
    for (const ext of FILE_EXTENSIONS.VIDEO) {
      parts.push(`.${ext}`);
    }
  }

  return parts.join(",");
}

/**
 * Returns a human-readable description of supported file types.
 */
export function describeSupportedTypes(options: SupportedTypeOptions): string {
  const types: string[] = [];

  if (options.image) {
    types.push("images");
  }
  if (options.pdf) {
    types.push("PDFs");
  }
  if (options.text) {
    types.push("text & code files");
  }
  if (options.audio) {
    types.push("audio");
  }
  if (options.video) {
    types.push("video");
  }

  if (types.length === 0) {
    return "No file types supported";
  }

  if (types.length === 1) {
    return `Supports ${types[0]}`;
  }

  const last = types[types.length - 1];
  const rest = types.slice(0, -1);
  return `Supports ${rest.join(", ")} & ${last}`;
}

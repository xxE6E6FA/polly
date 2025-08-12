export function validateApiKey(provider: string, key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  switch (provider) {
    case "openai":
      return key.startsWith("sk-") && key.length > 20;
    case "anthropic":
      return key.startsWith("sk-ant-") && key.length > 20;
    case "google":
      return key.length > 20; // Google API keys vary in format
    case "openrouter":
      return key.startsWith("sk-or-") && key.length > 20;
    case "replicate":
      return key.startsWith("r8_") && key.length > 20;
    case "elevenlabs":
      // ElevenLabs keys vary; accept length > 20
      return key.length > 20;
    default:
      return false;
  }
}

// Humanize text by fixing common formatting issues
export function humanizeText(text: string): string {
  return (
    text
      // Fix double spaces
      .replace(/\s{2,}/g, " ")
      // Fix spaces before punctuation
      .replace(/\s+([.,!?;:])/g, "$1")
      // Ensure space after punctuation
      .replace(/([.,!?;:])(?=[A-Za-z])/g, "$1 ")
      // Trim
      .trim()
  );
}

// Utility function to get environment API keys for client-side use
export function getEnvironmentApiKey(provider: string): string | null {
  const envKeyMap = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    exa: "EXA_API_KEY",
  };

  const envKey = envKeyMap[provider as keyof typeof envKeyMap];
  if (!envKey) {
    return null;
  }

  // In client-side code, we can't access process.env directly
  // This function is mainly for type safety and consistency
  // The actual API key will be obtained server-side
  return null;
}

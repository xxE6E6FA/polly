
/**
 * Check which sampling parameters are supported by a specific provider
 * This helps avoid sending unsupported parameters that could cause API errors
 */
export function getSupportedSamplingParameters(provider: string): {
  temperature: boolean;
  topP: boolean;
  topK: boolean;
  frequencyPenalty: boolean;
  presencePenalty: boolean;
  repetitionPenalty: boolean;
} {
  switch (provider) {
    case "openai":
      return {
        temperature: true,
        topP: true,
        topK: true,
        frequencyPenalty: true,
        presencePenalty: true,
        repetitionPenalty: false, // OpenAI uses frequency_presence_penalty instead
      };
    case "anthropic":
      return {
        temperature: true,
        topP: true,
        topK: true,
        frequencyPenalty: false, // Anthropic doesn't support this
        presencePenalty: false, // Anthropic doesn't support this
        repetitionPenalty: false, // Anthropic doesn't support this
      };
    case "google":
      return {
        temperature: true,
        topP: true,
        topK: true,
        frequencyPenalty: false, // Gemini doesn't support this
        presencePenalty: false, // Gemini doesn't support this
        repetitionPenalty: false, // Gemini doesn't support this
      };
    case "groq":
      return {
        temperature: true,
        topP: true,
        topK: true,
        frequencyPenalty: true,
        presencePenalty: true,
        repetitionPenalty: true,
      };
    case "openrouter":
      // OpenRouter supports all parameters as it routes to various providers
      // The actual support depends on the underlying model
      return {
        temperature: true,
        topP: true,
        topK: true,
        frequencyPenalty: true,
        presencePenalty: true,
        repetitionPenalty: true,
      };
    default:
      // For unknown providers, be conservative and only send widely supported parameters
      return {
        temperature: true,
        topP: true,
        topK: false,
        frequencyPenalty: false,
        presencePenalty: false,
        repetitionPenalty: false,
      };
  }
}

/**
 * Filter persona sampling parameters to only include those supported by the provider
 * This prevents API errors when using unsupported parameters
 */
export function filterSamplingParameters(
  provider: string,
  params: {
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
  }
): {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
} {
  const supported = getSupportedSamplingParameters(provider);
  
  return {
    ...(supported.temperature && params.temperature !== undefined && { temperature: params.temperature }),
    ...(supported.topP && params.topP !== undefined && { topP: params.topP }),
    ...(supported.topK && params.topK !== undefined && { topK: params.topK }),
    ...(supported.frequencyPenalty && params.frequencyPenalty !== undefined && { frequencyPenalty: params.frequencyPenalty }),
    ...(supported.presencePenalty && params.presencePenalty !== undefined && { presencePenalty: params.presencePenalty }),
    ...(supported.repetitionPenalty && params.repetitionPenalty !== undefined && { repetitionPenalty: params.repetitionPenalty }),
  };
}


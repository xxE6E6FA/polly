/**
 * Re-exports from shared reasoning configuration
 * This ensures consistent reasoning behavior across both implementations
 */

export {
  type ReasoningEffortLevel,
  type ReasoningConfig,
  type ModelWithCapabilities,
  type ProviderStreamOptions,
  ANTHROPIC_BUDGET_MAP,
  GOOGLE_THINKING_BUDGET_MAP,
  getProviderReasoningConfig,
  getProviderReasoningOptions,
  normalizeReasoningEffort,
} from "../../../shared/reasoning-config";

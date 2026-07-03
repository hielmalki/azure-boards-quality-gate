import { Settings2, KeyRound } from 'lucide-react';
import { TokenUsagePill } from '../TokenUsagePill';

type HeaderActionsProps = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  isTokenUsageLoading: boolean;
  activeCount: number;
  onOpenRulesets: () => void;
  onOpenApiKeySettings: () => void;
};

/**
 * Rendert die rechte Seite des Anforderungsprüfungs-Headers.
 *
 * UI-Belegung:
 * - KI-Token-Verbrauch-Pill
 * - „API-Schlüssel"-Icon-Button
 * - „Regelsets"-Aktions-Button
 */
export function HeaderActions({
  totalTokens,
  inputTokens,
  outputTokens,
  isTokenUsageLoading,
  activeCount,
  onOpenRulesets,
  onOpenApiKeySettings,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <TokenUsagePill
        totalTokens={totalTokens}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        isLoading={isTokenUsageLoading}
      />
      <button
        onClick={onOpenApiKeySettings}
        className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        title="API-Schlüssel verwalten"
      >
        <KeyRound size={12} />
      </button>
      <button
        onClick={onOpenRulesets}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        title="Regelsets verwalten"
      >
        <Settings2 size={12} />
        <span>Regelsets ({activeCount})</span>
      </button>
    </div>
  );
}

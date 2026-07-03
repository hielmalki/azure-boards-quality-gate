import { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ExternalLink, Trash2 } from 'lucide-react';
import { saveAndValidateOpenAiApiKey, deleteOpenAiApiKey, type ApiKeyStatus } from '../api-key-data';

interface ApiKeySetupScreenProps {
  currentStatus: ApiKeyStatus;
  onComplete: () => void;
  onSkip: () => void;
}

export function ApiKeySetupScreen({ currentStatus, onComplete, onSkip }: ApiKeySetupScreenProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationState, setValidationState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const alreadyConfigured = currentStatus.configured;
  const canDelete = currentStatus.source === 'storage';

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteOpenAiApiKey();
    setIsDeleting(false);
    onComplete();
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    setIsSaving(true);
    setValidationState('idle');
    setErrorMessage(null);

    const result = await saveAndValidateOpenAiApiKey(apiKey.trim());

    setIsSaving(false);

    if (result.success) {
      setValidationState('success');
      setTimeout(() => onComplete(), 900);
    } else {
      setValidationState('error');
      setErrorMessage(result.error ?? 'Validierung fehlgeschlagen. Bitte Schlüssel prüfen.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleSave();
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-6">
      <div className="w-full max-w-[448px]">
        <div className="bg-white border border-[#e5e7eb] rounded-[10px] px-[25px] py-[25px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-5">

          {/* Kopfzeile */}
          <div className="space-y-1">
            <h2 className="text-[20px] leading-[30px] font-medium tracking-[-0.45px] text-[#101828]">
              OpenAI API-Schlüssel einrichten
            </h2>
            <p className="text-[14px] leading-5 tracking-[-0.15px] text-[#6a7282]">
              QualityGate AI nutzt OpenAI für KI-gestützte Analysen und Verbesserungsvorschläge.
            </p>
          </div>

          {/* Banner: Schlüssel bereits konfiguriert */}
          {alreadyConfigured && (
            <div className="flex items-center justify-between gap-2.5 px-3 py-2.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[8px]">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={14} className="text-[#16a34a] shrink-0" />
                <span className="text-[13px] leading-[18px] text-[#15803d] truncate">
                  <span className="font-mono">{currentStatus.maskedKey}</span>
                  {currentStatus.source === 'env' && (
                    <span className="text-[#86efac] ml-1">(Forge-Variable)</span>
                  )}
                </span>
              </div>
              {canDelete && (
                <button
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-[12px] text-[#dc2626] hover:bg-[#fee2e2] rounded transition-colors disabled:opacity-50"
                  title="Gespeicherten Schlüssel entfernen"
                >
                  {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  Entfernen
                </button>
              )}
            </div>
          )}

          {/* Eingabefeld */}
          <div className="space-y-1.5">
            <label className="text-[13px] leading-[18px] font-medium text-[#374151]">
              API-Schlüssel
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="sk-proj-..."
                className={`w-full h-9 px-3 pr-9 rounded-[8px] border text-[14px] leading-5 text-[#101828] placeholder:text-[#9ca3af] outline-none transition-colors font-mono ${
                  validationState === 'error'
                    ? 'border-[#fca5a5] bg-[#fff7f7] focus:border-[#f87171]'
                    : validationState === 'success'
                      ? 'border-[#86efac] bg-[#f0fdf4]'
                      : 'border-[#d1d5dc] bg-white focus:border-[#6366f1]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowKey(prev => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6a7282] transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {/* Validierungsrückmeldung */}
            {validationState === 'error' && errorMessage && (
              <div className="flex items-start gap-1.5">
                <AlertCircle size={13} className="text-[#ef4444] mt-[1px] shrink-0" />
                <p className="text-[12px] leading-4 text-[#ef4444]">{errorMessage}</p>
              </div>
            )}
            {validationState === 'success' && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-[#16a34a] shrink-0" />
                <p className="text-[12px] leading-4 text-[#16a34a]">Schlüssel erfolgreich validiert und gespeichert.</p>
              </div>
            )}
          </div>

          {/* Hilfe-Link */}
          <p className="text-[12px] leading-4 text-[#9ca3af]">
            API-Schlüssel erstellen unter{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6366f1] hover:underline inline-flex items-center gap-0.5"
            >
              platform.openai.com/api-keys
              <ExternalLink size={10} />
            </a>
          </p>

          {/* Aktionen */}
          <div className="flex items-center justify-between pt-[6px] min-h-11">
            <button
              onClick={onSkip}
              className="text-[12px] leading-4 font-medium text-[#99a1af] hover:text-[#6a7282] transition-colors"
            >
              {alreadyConfigured ? 'Abbrechen' : 'Später einrichten'}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!apiKey.trim() || isSaving || validationState === 'success'}
              className="h-9 flex items-center gap-1.5 px-4 bg-[#101828] text-white text-[14px] leading-5 font-medium tracking-[-0.15px] rounded-[8px] hover:bg-[#0f172a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Wird validiert…
                </>
              ) : validationState === 'success' ? (
                <>
                  <CheckCircle2 size={14} />
                  Gespeichert
                </>
              ) : (
                <>
                  Speichern
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

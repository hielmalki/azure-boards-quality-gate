import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_RULESETS, saveActiveRulesets } from './rulesets-data';

export type DefaultRuleset = {
  id: string;
  name: string;
  description: string;
  checksCount: number;
  recommended: boolean;
};

interface WelcomeScreenProps {
  onComplete: (selectedRulesets: string[]) => void;
  onSkip: () => void;
}

export function WelcomeScreen({ onComplete, onSkip }: WelcomeScreenProps) {
  const [selectedRulesets, setSelectedRulesets] = useState<string[]>(['basic-quality']);

  const handleToggle = (id: string) => {
    setSelectedRulesets(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  const handleStart = () => {
    const ids = selectedRulesets.length === 0 ? ['basic-quality'] : selectedRulesets;
    void saveActiveRulesets(ids);
    onComplete(ids);
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-6">
      <div className="w-full max-w-[448px]">
        <div className="bg-white border border-[#e5e7eb] rounded-[10px] px-[25px] py-[25px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-5">
          <div className="space-y-1">
            <h2 className="text-[20px] leading-[30px] font-medium tracking-[-0.45px] text-[#101828]">
              Regelsets auswählen
            </h2>
            <p className="text-[14px] leading-5 tracking-[-0.15px] text-[#6a7282] max-w-[386px]">
              Wähle aus, welche Prüfungen bei der Analyse angewendet werden sollen. Das lässt sich später ändern.
            </p>
          </div>

          <div className="space-y-[6px]">
            {DEFAULT_RULESETS.map(ruleset => {
              const isSelected = selectedRulesets.includes(ruleset.id);
              return (
                <button
                  key={ruleset.id}
                  onClick={() => handleToggle(ruleset.id)}
                  className={`w-full flex items-start gap-3 px-3 py-3 rounded-[10px] border text-left transition-colors ${
                    isSelected
                      ? 'border-[#8ec5ff] bg-[#eff6ff]'
                      : 'border-[#e5e7eb] bg-white hover:border-[#d1d5dc] hover:bg-[#f9fafb]'
                  }`}
                >
                  <div className={`w-4 h-4 mt-[2px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-[#155dfc] border-[#155dfc]' : 'border-[#d1d5dc] bg-white'
                  }`}>
                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-h-5">
                      <span className="text-[14px] leading-5 font-medium tracking-[-0.15px] text-[#101828]">
                        {ruleset.name}
                      </span>
                      {ruleset.recommended && (
                        <span className="text-[12px] leading-4 font-medium text-[#155dfc] bg-[#eff6ff] px-1.5 py-0.5 rounded-[4px]">
                          Empfohlen
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] leading-4 font-medium text-[#6a7282] mt-0.5 max-w-[306px]">
                      {ruleset.description}
                    </p>
                    <p className="text-[12px] leading-4 font-medium text-[#99a1af] mt-0.5">
                      {ruleset.checksCount} Prüfungen
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-[6px] min-h-11">
            <button
              onClick={onSkip}
              className="text-[12px] leading-4 font-medium text-[#99a1af] hover:text-[#6a7282] transition-colors"
            >
              Später einrichten
            </button>
            <button
              onClick={handleStart}
              className="h-9 flex items-center gap-1.5 px-4 bg-[#101828] text-white text-[14px] leading-5 font-medium tracking-[-0.15px] rounded-[8px] hover:bg-[#0f172a] transition-colors"
            >
              Loslegen
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

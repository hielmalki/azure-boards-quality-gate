import { Play, ArrowRight, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface FirstTimeExperienceProps {
  onComplete: () => void;
}

export function FirstTimeExperience({ onComplete }: FirstTimeExperienceProps) {
  const [currentStep, setCurrentStep] = useState<'intro' | 'analyzing' | 'results'>('intro');
  const [progress, setProgress] = useState(0);

  const startDemo = () => {
    setCurrentStep('analyzing');
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setCurrentStep('results'), 400);
          return 100;
        }
        return prev + 12;
      });
    }, 200);
  };

  if (currentStep === 'intro') {
    return (
      <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-6">
        <div className="w-full max-w-[448px]">
          <div className="bg-white border border-[#dfe1e6] rounded-xl px-[25px] py-[25px] shadow-[0_1px_2px_rgba(9,30,66,0.08)] space-y-5">
            <div>
              <h1 className="text-[21px] leading-[36px] font-semibold text-[#172b4d] mb-1">
                Anforderungs-Qualitätsprüfer
              </h1>
              <p className="text-[14px] leading-5 text-[#6b778c] max-w-[390px]">
                Prüft Jira-Tickets auf häufige Qualitätsprobleme und schlägt KI-gestützte Verbesserungen vor.
              </p>
            </div>

            <div className="border border-[#ebecf0] rounded-xl px-[13px] py-[13px] bg-[#f7f8fa]">
              <div className="text-[12px] leading-4 text-[#97a0af] mb-2">Demo-Ticket</div>
              <div className="text-[14px] leading-5 text-[#42526e]">
                „Als Nutzer möchte ich Suchergebnisse filtern können"
              </div>
            </div>

            <div className="space-y-2 text-[14px] leading-5 text-[#42526e]">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={14} className="text-[#ff4d4f] mt-0.5 shrink-0" />
                <span>Erkennt fehlende Akzeptanzkriterien, unklaren Nutzerwert und mehr.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Sparkles size={14} className="text-[#2563eb] mt-0.5 shrink-0" />
                <span>Generiert konkrete Verbesserungsvorschläge mithilfe von KI.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={14} className="text-[#22c55e] mt-0.5 shrink-0" />
                <span>Wendet Änderungen direkt in Jira an.</span>
              </div>
            </div>

            <button
              onClick={startDemo}
              className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-[#111827] text-white text-[14px] font-medium rounded-md hover:bg-[#0f172a] transition-colors"
            >
              <Play size={14} />
              Demo starten
            </button>

            <button
              onClick={onComplete}
              className="w-full text-center text-[12px] leading-4 text-[#97a0af] hover:text-[#6b778c] transition-colors pt-1"
            >
              Überspringen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'analyzing') {
    const steps = [
      { label: 'Strukturanalyse', done: progress > 30 },
      { label: 'Inhaltsqualität prüfen', done: progress > 60 },
      { label: 'Vorschläge generieren', done: progress > 90 }
    ];

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Loader2 size={18} className="text-blue-600 animate-spin" />
            <div>
              <div className="text-sm text-gray-900">Story wird analysiert…</div>
              <div className="text-xs text-gray-400">Demo-Ticket wird geprüft</div>
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {step.done ? (
                  <CheckCircle2 size={13} className="text-emerald-500" />
                ) : (
                  <Loader2 size={13} className="text-gray-400 animate-spin" />
                )}
                <span className={`text-xs ${step.done ? 'text-gray-500' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Ergebnisse
  return (
    <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-6">
      <div className="w-full max-w-[448px] bg-white border border-[#dfe1e6] rounded-xl px-[25px] py-[25px] shadow-[0_1px_2px_rgba(9,30,66,0.08)] space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="text-[#22c55e] mt-0.5 shrink-0" />
          <div>
            <div className="text-[14px] leading-5 font-medium text-[#172b4d]">
              Analyse abgeschlossen
            </div>
            <div className="text-[12px] leading-4 text-[#97a0af]">
              3 Probleme gefunden, 2 KI-Korrekturen verfügbar
            </div>
          </div>
        </div>

        <div className="space-y-[6px]">
          {[
            { label: 'Akzeptanzkriterien fehlen', fix: true },
            { label: 'Nutzerwert unklar', fix: true },
            { label: 'Keine konkreten Beispiele', fix: true },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2 bg-[#f7f8fa] rounded-[8px]"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={12} className="text-[#ff4d4f] shrink-0" />
                <span className="text-[12px] leading-4 text-[#42526e]">{item.label}</span>
              </div>
              {item.fix && (
                <span className="flex items-center gap-1 text-[12px] leading-4 text-[#2563eb]">
                  <Sparkles size={10} />
                  KI-Fix
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="text-[12px] leading-4 text-[#6b778c] bg-[#f7f8fa] rounded-[8px] px-3 py-3">
          Im nächsten Schritt können Sie Probleme einzeln oder alle auf einmal beheben.
        </div>

        <button
          onClick={onComplete}
          className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-[#111827] text-white text-[14px] font-medium rounded-md hover:bg-[#0f172a] transition-colors"
        >
          Weiter
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

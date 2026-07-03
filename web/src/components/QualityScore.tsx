import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, ChevronDown, ChevronRight, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-700';
  if (score >= 60) return 'text-amber-700';
  return 'text-red-700';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-400';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Gut';
  if (score >= 60) return 'Verbesserbar';
  return 'Kritisch';
}

export type ScoreBreakdownItem = {
  label: string;
  status: 'pass' | 'fail' | 'warning';
  weight: number;
};

export const DEFAULT_BREAKDOWN: ScoreBreakdownItem[] = [
  { label: 'Aussagekräftiger Titel', status: 'pass', weight: 8 },
  { label: 'Beschreibung vorhanden', status: 'pass', weight: 8 },
  { label: 'User-Story-Format', status: 'pass', weight: 6 },
  { label: 'Priorität gesetzt', status: 'pass', weight: 5 },
  { label: 'Story-Größe angemessen', status: 'pass', weight: 5 },
  { label: 'Akzeptanzkriterien', status: 'fail', weight: 20 },
  { label: 'Nutzerwert erkennbar', status: 'fail', weight: 18 },
  { label: 'Konkrete Beispiele', status: 'fail', weight: 14 },
  { label: 'Aufwandsschätzung', status: 'warning', weight: 8 },
  { label: 'Abhängigkeiten dokumentiert', status: 'warning', weight: 8 },
];

interface QualityScoreProps {
  score: number;
  previousScore?: number | null;
  breakdown?: ScoreBreakdownItem[];
  resolvedIds?: Set<string>;
}

const BREAKDOWN_ISSUE_MAP: Record<string, string> = {
  'Akzeptanzkriterien': 'ac-missing',
  'Nutzerwert erkennbar': 'value-unclear',
  'Konkrete Beispiele': 'examples-missing',
  'Aufwandsschätzung': 'estimation-missing',
  'Abhängigkeiten dokumentiert': 'dependencies-unclear',
};

export function QualityScore({
  score,
  previousScore = null,
  breakdown = DEFAULT_BREAKDOWN,
  resolvedIds = new Set(),
}: QualityScoreProps) {
  const [displayScore, setDisplayScore] = useState(previousScore ?? score);
  const [showDelta, setShowDelta] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const start = displayScore;
    const end = score;
    if (start === end) return;

    const duration = 800;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplayScore(current);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else if (previousScore !== null && previousScore < score) {
        setShowDelta(true);
        setTimeout(() => setShowDelta(false), 3000);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [score]);

  const delta = previousScore !== null ? score - previousScore : 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs ${getScoreBg(displayScore)} ${getScoreColor(displayScore)}`}>
          <span style={{ fontWeight: 600 }}>{displayScore}</span>
          <span className="opacity-50">/100</span>
          <span className="mx-0.5 opacity-25">·</span>
          <span style={{ fontWeight: 500 }}>{getScoreLabel(displayScore)}</span>
        </div>
        <AnimatePresence>
          {showDelta && delta > 0 && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              className="flex items-center gap-0.5 text-xs text-emerald-600"
              style={{ fontWeight: 500 }}
            >
              <TrendingUp size={11} />
              +{delta}
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden ml-1">
          <motion.div
            className={`h-full rounded-full ${getScoreBarColor(displayScore)}`}
            initial={{ width: `${previousScore ?? score}%` }}
            animate={{ width: `${displayScore}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 p-0.5"
          title="Score-Details"
        >
          {showBreakdown ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      <AnimatePresence>
        {showBreakdown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              {breakdown.map((item, index) => {
                const mappedId = BREAKDOWN_ISSUE_MAP[item.label];
                const dynamicStatus = mappedId && resolvedIds.has(mappedId) ? 'pass' : item.status;
                return (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    {dynamicStatus === 'pass' ? (
                      <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                    ) : dynamicStatus === 'fail' ? (
                      <AlertCircle size={10} className="text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                    )}
                    <span className={`flex-1 ${dynamicStatus === 'pass' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {item.label}
                    </span>
                    <span className="text-gray-300 tabular-nums">{item.weight}%</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

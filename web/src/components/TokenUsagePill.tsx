import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

type TokenUsagePillProps = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  isLoading: boolean;
};

export function TokenUsagePill({
  totalTokens,
  inputTokens,
  outputTokens,
  isLoading,
}: TokenUsagePillProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(current => !current)}
        title="KI-Token-Verbrauch"
        className="inline-flex items-center gap-1.5 rounded border border-transparent px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <Sparkles size={12} />
        <span>{isLoading ? '...' : `${totalTokens.toLocaleString()} Tokens`}</span>
      </button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            <div className="space-y-3 px-4 py-3">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-2xl tabular-nums text-gray-900"
                  style={{ fontWeight: 600 }}
                >
                  {isLoading ? '...' : totalTokens.toLocaleString()}
                </span>
                <span className="text-sm text-gray-400">Tokens verbraucht</span>
              </div>

              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Eingabe-Tokens</span>
                  <span className="tabular-nums">{inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ausgabe-Tokens</span>
                  <span className="tabular-nums">{outputTokens.toLocaleString()}</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-gray-400">
                Gesamtzahl der von KI-Analysen und Fix-Vorschlägen verbrauchten Tokens. Der Zähler
                läuft fortlaufend weiter und wird nicht zurückgesetzt.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

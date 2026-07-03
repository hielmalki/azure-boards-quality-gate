import { motion } from 'motion/react';
import { X } from 'lucide-react';

/**
 * Hinweisbox für den Erststart:
 * Zeigt den Nutzer:innen, dass die Analyse mit dem Standard-Regelwerk gelaufen ist
 * und bietet direkten Einstieg in die Regelwerk-Verwaltung.
 */
export function WelcomeBanner({
  onDismiss,
  onOpenRulesets,
}: {
  onDismiss: () => void;
  onOpenRulesets: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="bg-white border border-blue-200 rounded-lg px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs text-gray-500">
            Mit Standard-Regelset analysiert.
            <button
              onClick={onOpenRulesets}
              className="text-blue-600 hover:text-blue-700 transition-colors ml-1"
              style={{ fontWeight: 500 }}
            >
              Regelsets anpassen
            </button>
          </p>
        </div>
        <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
}

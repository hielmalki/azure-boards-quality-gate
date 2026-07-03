import { Copy, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import * as SDK from 'azure-devops-extension-sdk';
import type { DuplicateCandidate } from '../../hooks/useDuplicateCheck';

type DuplicateSectionProps = {
  candidates: DuplicateCandidate[];
  keywords: string[];
  isLoading: boolean;
  error: string | null;
  skipped: boolean;
  hasCompleted: boolean;
};

const STATUS_CATEGORY_COLORS: Record<string, string> = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'To Do': 'bg-gray-100 text-gray-600',
  'Done': 'bg-green-100 text-green-700',
};

function statusBadgeClass(statusCategory: string) {
  return STATUS_CATEGORY_COLORS[statusCategory] ?? 'bg-gray-100 text-gray-600';
}

// Ersetzt `router.open('/browse/KEY')` aus Forge – es gibt keinen ADO-Extension-
// Navigationsdienst für „öffne ein anderes Work Item"; stattdessen wird die
// Work-Item-Form-URL aus Org- und Projektname (SDK-Host-/Web-Kontext) gebaut
// und in einem neuen Tab geöffnet. `key` ist hier die numerische Work-Item-Id
// (siehe DuplicateCandidate/work-item-gateway.js).
function openIssue(key: string) {
  const projectName = SDK.getWebContext()?.project?.name;

  if (!projectName) {
    console.error('[QualityGate AI] Projektkontext nicht verfügbar, kann Work Item nicht öffnen.');
    return;
  }

  const organizationName = SDK.getHost().name;
  const url = `https://dev.azure.com/${encodeURIComponent(organizationName)}/${encodeURIComponent(projectName)}/_workitems/edit/${encodeURIComponent(key)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Zeigt mögliche Duplikat-Tickets, die vom Duplikatprüfungs-Regelset gefunden wurden.
 * Wird als separate Karte unterhalb der Triage-Sektionen angezeigt, wenn das Regelset aktiv ist.
 */
export function DuplicateSection({ candidates, keywords, isLoading, error, skipped, hasCompleted }: DuplicateSectionProps) {
  // Nichts rendern, bevor die Prüfung für das aktuelle Ticket gestartet wurde.
  if (!isLoading && !hasCompleted) {
    return null;
  }

  const isCleanResult = !isLoading && !error && !skipped && candidates.length === 0;
  const containerClass = isCleanResult
    ? 'rounded-lg border border-green-200 bg-green-50 overflow-hidden'
    : 'rounded-lg border border-amber-200 bg-amber-50 overflow-hidden';
  const headerBorderClass = isCleanResult ? 'border-b border-green-200' : 'border-b border-amber-200';
  const headerLabelClass = isCleanResult
    ? 'text-xs font-medium text-green-700 tracking-wide uppercase'
    : 'text-xs font-medium text-amber-700 tracking-wide uppercase';

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${headerBorderClass}`}>
        {isCleanResult ? (
          <CheckCircle2 size={13} className="text-green-600 shrink-0" />
        ) : (
          <Copy size={13} className="text-amber-600 shrink-0" />
        )}
        <span className={headerLabelClass}>
          {isCleanResult ? 'Keine Duplikate gefunden' : 'Mögliche Duplikate'}
        </span>
        {isLoading && (
          <Loader2 size={12} className="text-amber-500 animate-spin ml-auto" />
        )}
        {!isLoading && candidates.length > 0 && (
          <span className="ml-auto text-xs text-amber-600">
            {candidates.length} gefunden
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="px-4 py-3 text-xs text-amber-600">
          Projekt wird nach ähnlichen Tickets durchsucht…
          {keywords.length > 0 && (
            <span className="ml-1 text-amber-500">
              ({keywords.join(', ')})
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="px-4 py-3 text-xs text-amber-700">
          {error}
        </div>
      )}

      {/* Results */}
      {!isLoading && candidates.length > 0 && (
        <>
          {keywords.length > 0 && (
            <div className="px-4 pt-2.5 pb-1 text-[11px] text-amber-500">
              Treffer für: {keywords.join(', ')}
            </div>
          )}
          <ul className="divide-y divide-amber-100">
            {candidates.map(candidate => (
              <li key={candidate.key} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => openIssue(candidate.key)}
                  className="flex items-center gap-1.5 text-xs font-mono text-amber-700 hover:text-amber-900 hover:underline shrink-0"
                >
                  {candidate.key}
                  <ExternalLink size={10} />
                </button>
                <span className="text-xs text-gray-700 flex-1 truncate" title={candidate.summary}>
                  {candidate.summary}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${statusBadgeClass(candidate.statusCategory)}`}>
                  {candidate.statusCategory}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Übersprungen: Ticket-Titel enthält nicht genug eindeutige Schlüsselwörter */}
      {!isLoading && !error && skipped && (
        <div className="px-4 py-3 text-xs text-amber-700">
          Duplikatprüfung übersprungen – der Ticket-Titel enthält nicht genug eindeutige Schlüsselwörter.
        </div>
      )}

      {/* Keine Ergebnisse nach einer echten Suche */}
      {!isLoading && !error && !skipped && candidates.length === 0 && (
        <div className="px-4 py-3 text-xs text-green-700">
          Keine ähnlichen offenen Tickets in diesem Projekt gefunden.
          {keywords.length > 0 && (
            <span className="ml-1 text-green-600">
              (Gesucht nach: {keywords.join(', ')})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import { searchDuplicateCandidates, isSafeWorkItemId } from '../gateways/azure-devops/work-item-gateway.js';
import { logError, logInfo } from '../utils/logger.js';

/**
 * Wörter, die kein unterscheidendes Signal für die Duplikaterkennung liefern.
 * Bewusst breit gehalten – wir möchten auf Domänen-Nomen treffen, nicht auf Verben/Artikel.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'as', 'by',
  'with', 'from', 'into', 'of', 'is', 'it', 'be', 'are', 'was', 'were',
  'has', 'have', 'do', 'does', 'did', 'not', 'no', 'so', 'if', 'but',
  'fix', 'add', 'update', 'improve', 'make', 'get', 'set', 'use', 'show',
  'create', 'remove', 'delete', 'change', 'move', 'implement', 'refactor',
  'support', 'enable', 'disable', 'handle', 'check', 'ensure', 'allow',
  'new', 'old', 'when', 'then', 'that', 'this', 'should', 'would', 'could',
  'need', 'want', 'will', 'can', 'may', 'must', 'have', 'been', 'being',
]);

const MAX_KEYWORDS = 4;
const MAX_CANDIDATES = 5;

/**
 * Extrahiert aussagekräftige Schlüsselwörter aus einem Ticket-Titel.
 * Entfernt Stoppwörter und sehr kurze Tokens, begrenzt auf MAX_KEYWORDS.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, MAX_KEYWORDS);
}

/**
 * Durchsucht dasselbe Azure-DevOps-Projekt nach Work Items mit ähnlichen Titeln.
 *
 * Gibt bis zu MAX_CANDIDATES offene Work Items zurück, die Schlüsselwörter mit dem
 * aktuellen Titel teilen. Das aktuelle Work Item wird aus den Ergebnissen ausgeschlossen.
 *
 * @param {{ issueKey: string, summary: string, projectKey: string }} params
 * @param {{ searchDuplicateCandidatesFn?: Function }} [deps]
 * @returns {Promise<{
 *   candidates: Array<{ key: string, summary: string, status: string, statusCategory: string }>,
 *   keywords: string[],
 *   skipped: boolean,
 *   error: string | null
 * }>}
 */
export async function findDuplicateCandidates(
  { issueKey, summary, projectKey },
  { searchDuplicateCandidatesFn = searchDuplicateCandidates } = {}
) {
  const keywords = extractKeywords(summary);

  if (keywords.length < 2) {
    logInfo('duplicate_check.skipped', {
      issueKey,
      reason: 'too_few_keywords',
      keywordCount: keywords.length,
    });
    return { candidates: [], keywords, skipped: true, error: null };
  }

  if (!isSafeWorkItemId(String(issueKey ?? ''))) {
    logInfo('duplicate_check.skipped', {
      issueKey,
      reason: 'invalid_work_item_id',
    });
    return { candidates: [], keywords, skipped: true, error: null };
  }

  try {
    const items = await searchDuplicateCandidatesFn({
      workItemId: issueKey,
      keywords,
      project: projectKey,
      maxCandidates: MAX_CANDIDATES,
    });

    const candidates = items.map(item => ({
      key: item.id,
      summary: item.title,
      status: item.state,
      statusCategory: item.stateCategory ?? '',
    }));

    logInfo('duplicate_check.completed', {
      issueKey,
      projectKey,
      keywords,
      candidateCount: candidates.length,
    });

    return { candidates, keywords, skipped: false, error: null };
  } catch (error) {
    logError('duplicate_check.failed', error, { issueKey, projectKey, keywords });
    return {
      candidates: [],
      keywords,
      skipped: false,
      error: error instanceof Error ? error.message : 'Duplicate check failed.',
    };
  }
}

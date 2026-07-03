import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { CustomRule, CustomRuleEvaluatorType, CustomRuleScope, TicketType, CustomRuleset } from './rulesets-data';

interface CreateRulesetFlowProps {
  onClose: () => void;
  onSave: (ruleset: CustomRuleset) => void;
  initialRuleset?: CustomRuleset;
}

const TICKET_TYPES: { value: TicketType; label: string }[] = [
  { value: 'Story', label: 'Story' },
  { value: 'Bug', label: 'Bug' },
  { value: 'Task', label: 'Task' },
];

const EVALUATOR_TYPES: { value: CustomRuleEvaluatorType; label: string; hint: string }[] = [
  { value: 'deterministic', label: 'Deterministisch', hint: 'Explizite Muster, klar überprüfbar' },
  { value: 'semantic_llm', label: 'Semantisch (LLM)', hint: 'Semantische Auswertung für KI-gestützte Regeln' },
];

const RULE_SCOPE_OPTIONS: { value: CustomRuleScope; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Leitet den Prüfbereich aus der Regel ab (empfohlen)' },
  { value: 'title', label: 'Titel', hint: 'Prüft nur den Jira-Titel' },
  { value: 'main_description', label: 'Hauptbeschreibung', hint: 'Prüft den Beschreibungsteil vor technischen/AK-Sektionen' },
  { value: 'full_description', label: 'Vollständige Beschreibung', hint: 'Prüft den gesamten Beschreibungstext' },
];

function generateId() {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function emptyRule(): CustomRule {
  return {
    id: generateId(),
    name: '',
    checkDescription: '',
    severity: 'warning',
    evaluatorType: 'semantic_llm',
    scope: 'auto',
    example: '',
  };
}

export function CreateRulesetFlow({ onClose, onSave, initialRuleset }: CreateRulesetFlowProps) {
  const isEditMode = Boolean(initialRuleset);

  // Regelset-Ebene
  const [name, setName] = useState(initialRuleset?.name ?? '');
  const [description, setDescription] = useState(initialRuleset?.description ?? '');
  const [appliesTo, setAppliesTo] = useState<TicketType[]>(
    initialRuleset?.appliesTo && initialRuleset.appliesTo.length > 0
      ? initialRuleset.appliesTo
      : ['Story']
  );

  // Regeln
  const [rules, setRules] = useState<CustomRule[]>(
    initialRuleset?.rules && initialRuleset.rules.length > 0
      ? initialRuleset.rules.map(r => ({
          ...r,
          evaluatorType: r.evaluatorType ?? 'semantic_llm',
          scope: r.scope ?? 'auto',
          example: r.example ?? '',
        }))
      : [emptyRule()]
  );
  const [expandedRule, setExpandedRule] = useState<string | null>(rules[0]?.id ?? null);

  // Validierung
  const [showErrors, setShowErrors] = useState(false);

  const toggleTicketType = (type: TicketType) => {
    setAppliesTo(prev => {
      if (prev.includes(type)) {
        return prev.length > 1 ? prev.filter(t => t !== type) : prev;
      }
      return [...prev, type];
    });
  };

  const updateRule = (id: string, updates: Partial<CustomRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const addRule = () => {
    const newRule = emptyRule();
    setRules(prev => [...prev, newRule]);
    setExpandedRule(newRule.id);
  };

  const removeRule = (id: string) => {
    if (rules.length <= 1) return;
    setRules(prev => prev.filter(r => r.id !== id));
    if (expandedRule === id) {
      setExpandedRule(rules.find(r => r.id !== id)?.id ?? null);
    }
  };

  const isValid = () => {
    if (!name.trim()) return false;
    if (rules.length === 0) return false;
    return rules.every(r => r.name.trim() && r.checkDescription.trim());
  };

  const handleSave = () => {
    if (!isValid()) {
      setShowErrors(true);
      return;
    }
    const ruleset: CustomRuleset = {
      id: initialRuleset?.id ?? generateId(),
      name: name.trim(),
      description: description.trim() || `${rules.length} benutzerdefinierte Prüfungen`,
      appliesTo,
      rules: rules.map(r => ({
        ...r,
        name: r.name.trim(),
        checkDescription: r.checkDescription.trim(),
        example: r.example?.trim() || undefined,
      })),
      createdAt: initialRuleset?.createdAt ?? Date.now(),
    };
    onSave(ruleset);
  };

  const fieldError = (val: string) => showErrors && !val.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(9,30,66,0.54)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-lg bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100vh - 48px)' }}
      >
        {/* Kopfzeile */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm text-gray-900" style={{ fontWeight: 600 }}>
            {isEditMode ? 'Eigenes Regelset bearbeiten' : 'Eigenes Regelset erstellen'}
          </h2>
        </div>

        {/* Scrollbarer Inhalt */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* === ABSCHNITT: Regelset-Info === */}
          <div>
            <div className="text-xs text-gray-400 tracking-wide mb-3">REGELSET</div>

            {/* Name */}
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1" style={{ fontWeight: 500 }}>
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="z. B. Team-Konventionen"
                className={`w-full px-3 py-2 text-sm text-gray-900 rounded-md border transition-colors outline-none ${
                  fieldError(name) ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-400'
                }`}
              />
              {fieldError(name) && (
                <p className="text-xs text-red-500 mt-1">Name ist erforderlich</p>
              )}
            </div>

            {/* Beschreibung */}
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1" style={{ fontWeight: 500 }}>
                Beschreibung
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Kurze Beschreibung (optional)"
                className="w-full px-3 py-2 text-sm text-gray-900 rounded-md border border-gray-200 focus:border-blue-400 transition-colors outline-none"
              />
            </div>

            {/* Gilt für */}
            <div>
              <label className="block text-xs text-gray-600 mb-1.5" style={{ fontWeight: 500 }}>
                Gilt für
              </label>
              <div className="flex gap-1.5">
                {TICKET_TYPES.map(type => {
                  const active = appliesTo.includes(type.value);
                  return (
                    <button
                      key={type.value}
                      onClick={() => toggleTicketType(type.value)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                        active
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      style={{ fontWeight: 500 }}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Trennlinie */}
          <div className="border-t border-gray-100" />

          {/* === ABSCHNITT: Regeln === */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-400 tracking-wide">REGELN ({rules.length})</div>
            </div>

            <div className="space-y-2">
              {rules.map((rule, index) => {
                const isExpanded = expandedRule === rule.id;
                return (
                  <div
                    key={rule.id}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                  >
                    {/* Regelkopf-Zeile */}
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                    >
                      {rule.severity === 'critical' ? (
                        <AlertCircle size={14} className="text-red-500 shrink-0" />
                      ) : (
                        <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                      )}
                      <span className="flex-1 text-sm text-gray-900 truncate">
                        {rule.name || `Regel ${index + 1}`}
                      </span>
                      {rules.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRule(rule.id);
                          }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={14} className="text-gray-400 shrink-0" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400 shrink-0" />
                      )}
                    </div>

                    {/* Aufgeklapptes Regelformular */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-100">
                            {/* Regelname */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Regelname <span className="text-red-400">*</span>
                              </label>
                              <input
                                type="text"
                                value={rule.name}
                                onChange={e => updateRule(rule.id, { name: e.target.value })}
                                placeholder="z. B. Akzeptanzkriterien vorhanden"
                                className={`w-full px-3 py-1.5 text-sm text-gray-900 rounded-md border transition-colors outline-none ${
                                  fieldError(rule.name) ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-400'
                                }`}
                              />
                            </div>

                            {/* Prüfbeschreibung */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Was soll geprüft werden? <span className="text-red-400">*</span>
                              </label>
                              <textarea
                                value={rule.checkDescription}
                                onChange={e => updateRule(rule.id, { checkDescription: e.target.value })}
                                placeholder="z. B. Prüfe, ob mindestens 2 Akzeptanzkriterien im Given-When-Then-Format vorhanden sind."
                                rows={2}
                                className={`w-full px-3 py-1.5 text-sm text-gray-900 rounded-md border transition-colors outline-none resize-none ${
                                  fieldError(rule.checkDescription) ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-400'
                                }`}
                              />
                            </div>

                            {/* Schweregrad */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">
                                Schweregrad bei Verstoß
                              </label>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => updateRule(rule.id, { severity: 'critical' })}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                                    rule.severity === 'critical'
                                      ? 'border-red-300 bg-red-50 text-red-700'
                                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                                  }`}
                                  style={{ fontWeight: 500 }}
                                >
                                  <AlertCircle size={12} />
                                  Kritisch
                                </button>
                                <button
                                  onClick={() => updateRule(rule.id, { severity: 'warning' })}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                                    rule.severity === 'warning'
                                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                                  }`}
                                  style={{ fontWeight: 500 }}
                                >
                                  <AlertTriangle size={12} />
                                  Warnung
                                </button>
                              </div>
                            </div>

                            {/* Evaluator-Typ */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">
                                Evaluator-Typ
                              </label>
                              <select
                                value={rule.evaluatorType ?? 'semantic_llm'}
                                onChange={event =>
                                  updateRule(rule.id, {
                                    evaluatorType: event.target.value as CustomRuleEvaluatorType,
                                  })
                                }
                                className="w-full px-3 py-1.5 text-sm text-gray-900 rounded-md border border-gray-200 focus:border-blue-400 transition-colors outline-none bg-white"
                              >
                                {EVALUATOR_TYPES.map(type => (
                                  <option key={type.value} value={type.value}>
                                    {type.label}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-gray-400 mt-1">
                                {EVALUATOR_TYPES.find(type => type.value === (rule.evaluatorType ?? 'semantic_llm'))?.hint}
                              </p>
                            </div>

                            {/* Prüfbereich */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">
                                Prüfbereich
                              </label>
                              <select
                                value={rule.scope ?? 'auto'}
                                onChange={event =>
                                  updateRule(rule.id, {
                                    scope: event.target.value as CustomRuleScope,
                                  })
                                }
                                className="w-full px-3 py-1.5 text-sm text-gray-900 rounded-md border border-gray-200 focus:border-blue-400 transition-colors outline-none bg-white"
                              >
                                {RULE_SCOPE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-gray-400 mt-1">
                                {RULE_SCOPE_OPTIONS.find(option => option.value === (rule.scope ?? 'auto'))?.hint}
                              </p>
                            </div>

                            {/* Beispiel (optional) */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Beispiel oder Hinweis <span className="text-gray-300">(optional)</span>
                              </label>
                              <input
                                type="text"
                                value={rule.example || ''}
                                onChange={e => updateRule(rule.id, { example: e.target.value })}
                                placeholder="z. B. Gutes Beispiel: Gegeben ich bin eingeloggt, wenn ich auf Profil klicke…"
                                className="w-full px-3 py-1.5 text-sm text-gray-900 rounded-md border border-gray-200 focus:border-blue-400 transition-colors outline-none"
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Regel hinzufügen */}
            <button
              onClick={addRule}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus size={13} />
              Regel hinzufügen
            </button>
          </div>
        </div>

        {/* Fußzeile */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">
            {rules.length} {rules.length === 1 ? 'Regel' : 'Regeln'} · {appliesTo.join(', ')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-md transition-colors"
            >
              {isEditMode ? 'Änderungen speichern' : 'Regelset erstellen'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

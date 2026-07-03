import { X, CheckCircle2, Settings2, Plus, Pencil, Trash2, User, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  saveActiveRulesets,
  saveCustomRuleset,
  updateCustomRuleset,
  deleteCustomRuleset,
  getRulesetsState,
  getEvaluatorTypeLabel,
} from './rulesets-data';
import type { CustomRuleset } from './rulesets-data';
import { CreateRulesetFlow } from './CreateRulesetFlow';

interface RulesetManagerProps {
  onClose: () => void;
  onRulesetsSaved?: (activeRulesetIds: string[]) => void;
}

export function RulesetManager({ onClose, onRulesetsSaved }: RulesetManagerProps) {
  const [allRulesets, setAllRulesets] = useState<Awaited<ReturnType<typeof getRulesetsState>>['allRulesets']>([]);
  const [customRulesets, setCustomRulesets] = useState<CustomRuleset[]>([]);
  const [selected, setSelected] = useState<string[]>(['basic-quality']);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRuleset, setEditingRuleset] = useState<CustomRuleset | null>(null);
  const [expandedCustomRulesetId, setExpandedCustomRulesetId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initializeRulesets() {
      try {
        const rulesetsState = await getRulesetsState();
        if (!isMounted) {
          return;
        }

        setAllRulesets(rulesetsState.allRulesets);
        setCustomRulesets(rulesetsState.customRulesets);
        setSelected(rulesetsState.activeRulesetIds);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeRulesets();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = (id: string) => {
    setSelected([id]);
  };

  const handleDelete = async (id: string) => {
    const nextState = await deleteCustomRuleset(id);
    setAllRulesets(nextState.allRulesets);
    setCustomRulesets(nextState.customRulesets);
    setSelected(nextState.activeRulesetIds);
  };

  const handleEdit = (id: string) => {
    const ruleset = customRulesets.find(entry => entry.id === id);
    if (!ruleset) {
      return;
    }
    setEditingRuleset(ruleset);
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const nextState = await saveActiveRulesets(selected);
      onRulesetsSaved?.(nextState.activeRulesetIds);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSave = async (ruleset: CustomRuleset) => {
    const nextState = await saveCustomRuleset(ruleset);
    setAllRulesets(nextState.allRulesets);
    setCustomRulesets(nextState.customRulesets);
    setSelected([ruleset.id]);
    setShowCreate(false);
  };

  const handleEditSave = async (ruleset: CustomRuleset) => {
    const nextState = await updateCustomRuleset(ruleset);
    setAllRulesets(nextState.allRulesets);
    setCustomRulesets(nextState.customRulesets);
    setSelected(nextState.activeRulesetIds);
    setEditingRuleset(null);
  };

  // Erstell-Flow statt Manager anzeigen
  if (showCreate) {
    return (
      <AnimatePresence>
        <CreateRulesetFlow
          onClose={() => setShowCreate(false)}
          onSave={handleCreateSave}
        />
      </AnimatePresence>
    );
  }

  // Bearbeitungs-Flow (vorausgefüllt) statt Manager anzeigen
  if (editingRuleset) {
    return (
      <AnimatePresence>
        <CreateRulesetFlow
          initialRuleset={editingRuleset}
          onClose={() => setEditingRuleset(null)}
          onSave={handleEditSave}
        />
      </AnimatePresence>
    );
  }

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
        className="w-full max-w-xl bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col"
        style={{ height: 'min(640px, calc(100vh - 48px))' }}
      >
        <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Settings2 size={15} className="text-gray-400" />
                <h2 className="text-sm text-gray-900" style={{ fontWeight: 600 }}>
                  Regelsets verwalten
                </h2>
              </div>
              <button
                onClick={onClose}
                disabled={isSaving}
                className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* Description */}
            <div className="px-5 pt-3 pb-1">
              <p className="text-xs text-gray-500">
                Aktive Regelsets bestimmen, welche Prüfungen bei der Analyse ausgeführt werden.
              </p>
            </div>

            {/* Scrollable ruleset list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
              {isLoading ? (
                <div className="px-1 py-3 text-xs text-gray-400">Regelsets werden geladen…</div>
              ) : (() => {
                const systemRulesets = allRulesets.filter(r => !r.isCustom);
                const customRulesets = allRulesets.filter(r => r.isCustom);

                const renderRulesetCard = (ruleset: typeof allRulesets[0]) => {
                  const isActive = selected.includes(ruleset.id);
                  return (
                    <div
                      key={ruleset.id}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        isActive
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <button onClick={() => handleToggle(ruleset.id)} className="mt-0.5 shrink-0">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {isActive && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                      </button>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleToggle(ruleset.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(ruleset.id); } }}
                        className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900">{ruleset.name}</span>
                          {ruleset.recommended && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Empfohlen</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{ruleset.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{ruleset.checksCount} Prüfungen</p>
                        {ruleset.isCustom && ruleset.evaluatorSummary && (
                          <p className="text-xs text-gray-400 mt-0.5">Evaluator: {ruleset.evaluatorSummary}</p>
                        )}
                        {ruleset.isCustom && Array.isArray(ruleset.customRules) && ruleset.customRules.length > 0 && (
                          <div className="mt-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedCustomRulesetId(cur => cur === ruleset.id ? null : ruleset.id); }}
                              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              {expandedCustomRulesetId === ruleset.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                              Regeldetails
                            </button>
                            {expandedCustomRulesetId === ruleset.id && (
                              <div className="mt-1.5 space-y-1">
                                {ruleset.customRules.map(rule => (
                                  <div key={rule.id} className="text-xs text-gray-400">
                                    <span className="text-gray-500">{rule.name || 'Unbenannte Regel'}</span>
                                    <span> – {getEvaluatorTypeLabel(rule.evaluatorType)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {ruleset.isCustom && (
                        <div className="mt-0.5 flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => handleEdit(ruleset.id)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-blue-500 transition-colors"
                            title="Regelset bearbeiten"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(ruleset.id)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-red-500 transition-colors"
                            title="Regelset löschen"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {/* Sektion: Standard-Regelwerke */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide px-0.5">
                        Standard-Regelsets
                      </p>
                      {systemRulesets.map(renderRulesetCard)}
                    </div>

                    {/* Sektion: Eigene Regelwerke */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide px-0.5">
                        Eigene Regelsets
                      </p>
                      {customRulesets.length > 0
                        ? customRulesets.map(renderRulesetCard)
                        : (
                          <p className="text-xs text-gray-400 px-0.5 py-1">
                            Noch keine eigenen Regelsets erstellt.
                          </p>
                        )
                      }
                      <button
                        disabled={isLoading || isSaving}
                        onClick={() => setShowCreate(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Plus size={13} />
                        Eigenes Regelset erstellen
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {selected.length} von {allRulesets.length} aktiv
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  disabled={isLoading || isSaving}
                  onClick={handleSave}
                  className="px-4 py-1.5 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Wird gespeichert…' : 'Speichern'}
                </button>
              </div>
            </div>
        </>
      </motion.div>
    </div>
  );
}

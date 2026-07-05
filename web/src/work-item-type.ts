// Gating der Extension auf einen bestimmten Work-Item-Typ. Die
// `work-item-form-page`-Contribution erscheint im ADO-Formular auf allen
// Work-Item-Typen; da es keinen deklarativen Manifest-Filter gibt, entscheidet
// diese reine Prüf-Funktion zur Laufzeit, ob das Tool angezeigt wird.

export const SUPPORTED_WORK_ITEM_TYPE = 'User Story';

// Fail-open: Ist der Typ unbekannt/leer (z. B. weil das SDK ihn nicht liefern
// konnte), wird das Tool zugelassen, statt es fälschlich auszublenden.
export function isSupportedWorkItemType(type: string | null): boolean {
  if (!type) return true;
  return type.trim().toLowerCase() === SUPPORTED_WORK_ITEM_TYPE.toLowerCase();
}

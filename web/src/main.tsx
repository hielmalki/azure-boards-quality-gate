import React from 'react';
import ReactDOM from 'react-dom/client';
import * as SDK from 'azure-devops-extension-sdk';
import App from './App';
import { setCurrentWorkItemId } from './api/invoke';
import { isSupportedWorkItemType, SUPPORTED_WORK_ITEM_TYPE } from './work-item-type';
import './styles/index.css';

// Minimaler Ausschnitt von IWorkItemFormService (azure-devops-extension-api),
// bewusst lokal definiert statt die volle API-Bibliothek als Abhängigkeit zu
// ziehen – wir brauchen die aktuelle Work-Item-Id sowie den Work-Item-Typ.
type WorkItemFormService = {
  getId(): Promise<number>;
  getFieldValue(fieldReferenceName: string): Promise<unknown>;
};

// Hinweis, der auf nicht unterstützten Work-Item-Typen statt des Tools erscheint.
// Der Tab selbst wird vom Host gerendert und lässt sich per Code nicht entfernen –
// wir steuern nur seinen Inhalt.
function UnsupportedWorkItemNotice() {
  return (
    <div className="size-full bg-gray-50 flex items-center justify-center p-6 text-center">
      <p className="text-sm text-gray-500 max-w-xs">
        QualityGate AI ist nur für {SUPPORTED_WORK_ITEM_TYPE}s verfügbar.
      </p>
    </div>
  );
}

const WORK_ITEM_FORM_SERVICE_ID = 'ms.vss-work-web.work-item-form';

async function resolveWorkItemId(): Promise<string | null> {
  try {
    const workItemFormService = await SDK.getService<WorkItemFormService>(WORK_ITEM_FORM_SERVICE_ID);
    const id = await workItemFormService.getId();
    return id != null ? String(id) : null;
  } catch (error) {
    console.error('[QualityGate AI] Konnte die Work-Item-ID nicht vom SDK ermitteln.', error);
    return null;
  }
}

async function resolveWorkItemType(): Promise<string | null> {
  try {
    const workItemFormService = await SDK.getService<WorkItemFormService>(WORK_ITEM_FORM_SERVICE_ID);
    const type = await workItemFormService.getFieldValue('System.WorkItemType');
    return typeof type === 'string' && type.length > 0 ? type : null;
  } catch (error) {
    console.error('[QualityGate AI] Konnte den Work-Item-Typ nicht vom SDK ermitteln.', error);
    return null;
  }
}

async function bootstrap() {
  // loaded: false, weil wir vor dem Rendern noch die Work-Item-Id auflösen –
  // notifyLoadSucceeded() signalisiert dem Host erst danach, dass die
  // Extension fertig geladen ist (siehe IExtensionInitOptions).
  await SDK.init({ loaded: false });
  await SDK.ready();

  const [workItemId, workItemType] = await Promise.all([
    resolveWorkItemId(),
    resolveWorkItemType(),
  ]);
  setCurrentWorkItemId(workItemId);

  // Nur auf unterstützten Work-Item-Typen (User Story) das volle Tool rendern;
  // andernfalls einen kurzen Hinweis im Tab anzeigen.
  const content = isSupportedWorkItemType(workItemType) ? <App /> : <UnsupportedWorkItemNotice />;

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>{content}</React.StrictMode>
  );

  await SDK.notifyLoadSucceeded();
}

void bootstrap();

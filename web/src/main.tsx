import React from 'react';
import ReactDOM from 'react-dom/client';
import * as SDK from 'azure-devops-extension-sdk';
import App from './App';
import { setCurrentWorkItemId } from './api/invoke';
import './styles/index.css';

// Minimaler Ausschnitt von IWorkItemFormService (azure-devops-extension-api),
// bewusst lokal definiert statt die volle API-Bibliothek als Abhängigkeit zu
// ziehen – wir brauchen ausschließlich die aktuelle Work-Item-Id.
type WorkItemFormService = {
  getId(): Promise<number>;
};

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

async function bootstrap() {
  // loaded: false, weil wir vor dem Rendern noch die Work-Item-Id auflösen –
  // notifyLoadSucceeded() signalisiert dem Host erst danach, dass die
  // Extension fertig geladen ist (siehe IExtensionInitOptions).
  await SDK.init({ loaded: false });
  await SDK.ready();

  setCurrentWorkItemId(await resolveWorkItemId());

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  await SDK.notifyLoadSucceeded();
}

void bootstrap();

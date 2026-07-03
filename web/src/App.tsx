import { TriagePanel } from './components/TriagePanel';
import { ApiKeySetupScreen } from './components/ApiKeySetupScreen';
import { useState, useEffect } from 'react';
import { loadUserState, saveUserState } from './components/rulesets-data';
import { getApiKeyStatus, type ApiKeyStatus } from './api-key-data';

export default function App() {
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const [userState, keyStatus] = await Promise.all([
          loadUserState(),
          getApiKeyStatus(),
        ]);
        if (!isMounted) return;

        setIsFirstTime(!userState.hasUsedPlugin);
        setApiKeyStatus(keyStatus);

        // Show API key setup if no key is configured yet.
        if (!keyStatus.configured) {
          setShowApiKeySetup(true);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initialize();
    return () => { isMounted = false; };
  }, []);

  const handleFirstTimeComplete = async () => {
    await saveUserState({ hasUsedPlugin: true });
    setIsFirstTime(false);
  };

  const handleApiKeyComplete = async () => {
    const refreshed = await getApiKeyStatus();
    setApiKeyStatus(refreshed);
    setShowApiKeySetup(false);
  };

  const handleApiKeySkip = async () => {
    const refreshed = await getApiKeyStatus();
    setApiKeyStatus(refreshed);
    setShowApiKeySetup(false);
  };

  if (isLoading) {
    return <div className="size-full bg-gray-50" />;
  }

  if (showApiKeySetup && apiKeyStatus) {
    return (
      <ApiKeySetupScreen
        currentStatus={apiKeyStatus}
        onComplete={() => void handleApiKeyComplete()}
        onSkip={() => void handleApiKeySkip()}
      />
    );
  }

  return (
    <div className="size-full bg-gray-50 overflow-auto">
      <TriagePanel
        isFirstTime={isFirstTime}
        onFirstTimeComplete={handleFirstTimeComplete}
        onOpenApiKeySettings={() => setShowApiKeySetup(true)}
        apiKeyConfigured={apiKeyStatus?.configured ?? true}
      />
    </div>
  );
}

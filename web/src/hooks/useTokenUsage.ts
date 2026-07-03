import { useState, useEffect, useCallback } from 'react';
import { invoke } from '../api/invoke';

interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastUpdated: number;
}

interface TokenUsageResponse {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const CACHE_KEY = 'ai_token_usage_cache';
const CACHE_DURATION = 5 * 60 * 1000;

// Liest den gecachten Verbrauch und toleriert einen defekten/veralteten Eintrag statt zu werfen.
function readCachedTokenUsage(): TokenUsageData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? (JSON.parse(cached) as TokenUsageData) : null;
  } catch {
    return null;
  }
}

export function useTokenUsage() {
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenUsage = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!forceRefresh) {
        const data = readCachedTokenUsage();
        if (data && Date.now() - data.lastUpdated < CACHE_DURATION) {
          setInputTokens(data.inputTokens);
          setOutputTokens(data.outputTokens);
          setTotalTokens(data.totalTokens);
        }
      }

      const response = await invoke<TokenUsageResponse>('getTokenUsage');
      setInputTokens(response.inputTokens);
      setOutputTokens(response.outputTokens);
      setTotalTokens(response.totalTokens);

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          totalTokens: response.totalTokens,
          lastUpdated: Date.now(),
        })
      );
    } catch (err) {
      console.error('Error loading AI token usage', err);
      setError('Token-Verbrauch konnte nicht geladen werden');

      const data = readCachedTokenUsage();
      if (data) {
        setInputTokens(data.inputTokens);
        setOutputTokens(data.outputTokens);
        setTotalTokens(data.totalTokens);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTokenUsage();
  }, [fetchTokenUsage]);

  // Memoisiert, damit Konsumenten `refresh` sicher in Effect-Deps listen können, ohne
  // den Effect bei jedem Parent-Render neu auszulösen (was zuvor eine doppelte
  // Batch-Vorschlags-Anfrage während einer laufenden Batch-Verarbeitung verursachte).
  const refresh = useCallback(() => fetchTokenUsage(true), [fetchTokenUsage]);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    isLoading,
    error,
    refresh,
  };
}

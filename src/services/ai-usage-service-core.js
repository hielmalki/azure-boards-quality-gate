// Kumulativer, nutzerindividueller Token-Verbrauchszähler – laufende Gesamtsumme
// der verbrauchten OpenAI-Tokens eines Nutzers über alle KI-gestützten Aktionen.

function normalizeUsageValue(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function normalizeUsage(usage) {
  const inputTokens = normalizeUsageValue(usage?.input_tokens ?? usage?.inputTokens);
  const outputTokens = normalizeUsageValue(usage?.output_tokens ?? usage?.outputTokens);
  const totalTokens =
    normalizeUsageValue(usage?.total_tokens ?? usage?.totalTokens) || inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

function normalizeIdentity(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toSafeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function buildEmptyUsageRecord({ accountId, installationId, nowIso }) {
  return {
    accountId,
    installationId,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    updatedAt: nowIso,
  };
}

function normalizeStoredRecord(record, { accountId, installationId, nowIso }) {
  if (!record) {
    return buildEmptyUsageRecord({ accountId, installationId, nowIso });
  }

  return {
    accountId,
    installationId,
    inputTokens: toSafeNonNegativeInteger(record.inputTokens),
    outputTokens: toSafeNonNegativeInteger(record.outputTokens),
    totalTokens: toSafeNonNegativeInteger(record.totalTokens),
    updatedAt: record.updatedAt ?? nowIso,
  };
}

function buildTokenUsageView(record) {
  return {
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    updatedAt: record.updatedAt,
  };
}

export function createAiUsageService({
  getStoredAiUsageFn,
  setStoredAiUsageFn,
  getNowFn = () => new Date(),
}) {
  async function getTokenUsage({ installationId, accountId }) {
    const nowIso = getNowFn().toISOString();
    const normalizedAccountId = normalizeIdentity(accountId, 'anonymous');
    const normalizedInstallationId = normalizeIdentity(installationId, 'default-installation');
    const storedRecord = await getStoredAiUsageFn(normalizedAccountId);
    const record = normalizeStoredRecord(storedRecord, {
      accountId: normalizedAccountId,
      installationId: normalizedInstallationId,
      nowIso,
    });

    return buildTokenUsageView(record);
  }

  async function recordUsage({ installationId, accountId, usage = null }) {
    // HINWEIS: Dies ist ein nicht-atomares Lesen-Modifizieren-Schreiben. Zwei gleichzeitige
    // recordUsage-Aufrufe für dieselbe accountId (z. B. ein einzelner Fix und ein Streaming-Lauf
    // gleichzeitig) können ein Update verlieren. Ein wirklich atomarer Zähler würde das Verschieben
    // dieses Eintrags in den Forge Custom Entity Store und die Verwendung von
    // kvs.transact().check(...) für optimistische Nebenläufigkeit erfordern – das ist hier
    // unverhältnismäßig, da es sich um eine rein informelle kumulative Summe ohne Limit oder
    // Durchsetzung handelt. Der gelegentliche Unterzählwert wird akzeptiert.
    const nowIso = getNowFn().toISOString();
    const normalizedAccountId = normalizeIdentity(accountId, 'anonymous');
    const normalizedInstallationId = normalizeIdentity(installationId, 'default-installation');
    const storedRecord = await getStoredAiUsageFn(normalizedAccountId);
    const currentRecord = normalizeStoredRecord(storedRecord, {
      accountId: normalizedAccountId,
      installationId: normalizedInstallationId,
      nowIso,
    });
    const requestUsage = normalizeUsage(usage);

    const nextRecord = {
      ...currentRecord,
      inputTokens: currentRecord.inputTokens + requestUsage.inputTokens,
      outputTokens: currentRecord.outputTokens + requestUsage.outputTokens,
      totalTokens: currentRecord.totalTokens + requestUsage.totalTokens,
      updatedAt: nowIso,
    };

    await setStoredAiUsageFn(normalizedAccountId, nextRecord);

    return {
      usage: requestUsage,
      totals: buildTokenUsageView(nextRecord),
    };
  }

  return {
    getTokenUsage,
    recordUsage,
  };
}

// Generischer Key-Value-Store auf Azure Table Storage.
//
// Ersetzt @forge/kvs (Migrationsschritt 2, siehe docs/azure-boards-migration-architektur.md).
// Die bestehenden Storage-Keys (siehe storage-keys.js, z. B. "analysis:42" oder
// "apply-audit:42:169999-abc") werden am ersten Doppelpunkt in PartitionKey (Präfix,
// z. B. "analysis") und RowKey (Rest, z. B. "42") aufgespalten – genau die
// Partition-/Row-Key-Umnutzung, die die Architektur-Doku für diesen Schritt vorschlägt.
//
// Der Wert wird als JSON-String in einer einzelnen Tabellenspalte gespeichert. Das ist
// bewusst einfach gehalten, um die bestehende schemalose kvs.get/set-Semantik 1:1
// nachzubilden. Bekannte Grenze: Table-Storage-Stringspalten sind auf 64 KiB begrenzt;
// sehr umfangreiche Analyse-/Audit-Datensätze könnten das künftig überschreiten
// (dann wäre ein Wechsel auf Blob Storage oder mehrere Spalten nötig).
//
// Auth: Verbindungsstring aus AZURE_STORAGE_CONNECTION_STRING, mit Fallback auf
// AzureWebJobsStorage (das die Function App ohnehin für den eigenen Storage-Account
// gesetzt hat – kein zusätzliches Secret nötig).

import { TableClient } from '@azure/data-tables';

const DEFAULT_TABLE_NAME = 'qualityGateKeyValueStore';

let cachedDefaultClient = null;

function getConnectionString() {
  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING ?? process.env.AzureWebJobsStorage;

  if (!connectionString) {
    throw new Error(
      'Azure Storage ist nicht konfiguriert. AZURE_STORAGE_CONNECTION_STRING oder AzureWebJobsStorage müssen gesetzt sein.'
    );
  }

  return connectionString;
}

function getTableName() {
  return process.env.AZURE_TABLE_NAME ?? DEFAULT_TABLE_NAME;
}

function getDefaultTableClient() {
  if (!cachedDefaultClient) {
    cachedDefaultClient = TableClient.fromConnectionString(getConnectionString(), getTableName(), {
      allowInsecureConnection: true,
    });
  }

  return cachedDefaultClient;
}

export function splitStorageKey(key) {
  const separatorIndex = key.indexOf(':');

  if (separatorIndex < 0) {
    return { partitionKey: key, rowKey: '_' };
  }

  return {
    partitionKey: key.slice(0, separatorIndex),
    rowKey: key.slice(separatorIndex + 1),
  };
}

export async function getValue(key, { tableClient = getDefaultTableClient() } = {}) {
  const { partitionKey, rowKey } = splitStorageKey(key);

  try {
    const entity = await tableClient.getEntity(partitionKey, rowKey);
    return entity.value != null ? JSON.parse(entity.value) : null;
  } catch (error) {
    if (error?.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function setValue(key, value, { tableClient = getDefaultTableClient() } = {}) {
  const { partitionKey, rowKey } = splitStorageKey(key);

  await tableClient.upsertEntity(
    { partitionKey, rowKey, value: JSON.stringify(value) },
    'Replace'
  );
}

export async function deleteValue(key, { tableClient = getDefaultTableClient() } = {}) {
  const { partitionKey, rowKey } = splitStorageKey(key);

  try {
    await tableClient.deleteEntity(partitionKey, rowKey);
  } catch (error) {
    if (error?.statusCode !== 404) {
      throw error;
    }
  }
}

function sanitizeMetadataValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    return value;
  }

  return value;
}

function buildLogEntry(eventName, metadata = {}) {
  return {
    event: eventName,
    ...Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key, sanitizeMetadataValue(value)])
    ),
  };
}

export function logInfo(eventName, metadata = {}) {
  console.log(JSON.stringify(buildLogEntry(eventName, metadata)));
}

export function logWarn(eventName, metadata = {}) {
  console.warn(JSON.stringify(buildLogEntry(eventName, metadata)));
}

export function logError(eventName, error, metadata = {}) {
  console.error(
    JSON.stringify(
      buildLogEntry(eventName, {
        ...metadata,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    )
  );
}

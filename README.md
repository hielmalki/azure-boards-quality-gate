# Azure Boards Quality Gate

Backend-Code für die Azure-DevOps/Azure-Boards-Version von QualityGate AI.

Dieses Repository ist aus dem ursprünglichen Jira-Forge-Plugin ([`jiraPlugin`](../jiraPlugin))
herausgelöst. Es enthält nur den Teil der Codebase, der für die Azure-Migration relevant ist bzw.
schon darauf umgestellt wurde — kein Forge-Resolver, kein `manifest.yml`, kein Frontend (Stand:
Extraktion, siehe unten).

## Quelle der Wahrheit

- [`docs/azure-boards-migration-architektur.md`](docs/azure-boards-migration-architektur.md) —
  Zielarchitektur, Schicht-für-Schicht-Analyse, empfohlene Umsetzungsreihenfolge (7 Schritte).
- [`docs/azure-boards-migration-umsetzung.md`](docs/azure-boards-migration-umsetzung.md) —
  Einsteiger-Kochrezept (wer macht was, Azure-Ressourcen-Setup).

## Stand der Migration

| Schritt | Status |
| --- | --- |
| 1. Backend-Host (Azure Functions) | 🟡 begonnen — Functions-v4-Projektgerüst + schmaler Vertikalschnitt (`/api/health`, `/api/work-items/{id}`) lokal verifiziert. Restliche ~28 Endpunkte fehlen noch. |
| 2. Repository-Schicht (Azure Table Storage/Cosmos) + Key Vault | ⬜ offen — `src/repositories/*` nutzt noch `@forge/kvs` |
| 3. Auth (SDK-Token-Validierung, Admin-Gate) | ⬜ offen |
| 4. Gateway gegen Azure DevOps WIT-REST-API | ✅ `src/gateways/azure-devops/work-item-gateway.js` |
| 5. ADF → HTML, Akzeptanzkriterien natives Feld | ✅ `issue-service.js` (lesen), `azure-devops-apply-service-core.js` (schreiben) |
| 6. Resolver → HTTP-Endpunkte | ⬜ offen |
| 7. `vss-extension.json` + Frontend | ⬜ offen — Frontend ist bewusst nicht Teil dieses Repos (Stand: Extraktion) |

**Wichtig:** Nur Endpunkte, die **nicht** über die Repository-Schicht laufen, sind aktuell
end-to-end lauffähig (z. B. `getWorkItem`) — alles, was `src/repositories/*` berührt (u. a.
`analyzeIssue` über `ruleset-service.js`), schlägt zur Laufzeit fehl, weil `@forge/kvs` außerhalb
von Forge nicht funktioniert. Das ist der bekannte, offene Schritt 2.

## Setup

```bash
npm install
npm test
```

### Azure Functions lokal starten

```bash
cp local.settings.json.example local.settings.json   # echte ADO-Werte eintragen
npm start                                             # ruft `func start` auf
curl http://localhost:7071/api/health
curl http://localhost:7071/api/work-items/<id>
```

Deploy auf die bestehende Function App (`qualitygate-ai-api`, Resource Group
`qualitygate-ai-rg`):

```bash
func azure functionapp publish qualitygate-ai-api
```

### Umgebungsvariablen (für das Azure-DevOps-Gateway)

| Variable | Zweck |
| --- | --- |
| `AZURE_DEVOPS_ORG_URL` | z. B. `https://dev.azure.com/deine-org` |
| `AZURE_DEVOPS_PROJECT` | Projektname in Azure Boards |
| `AZURE_DEVOPS_PAT` | Personal Access Token (Work Items Read & Write) |

Auth über PAT ist ein pragmatischer Zwischenstand (siehe Architektur-Doku, Schritt 3 ersetzt das
später durch SDK-Token-Validierung).

### Umgebungsvariablen (für den LLM-Provider)

| Variable | Zweck |
| --- | --- |
| `LLM_PROVIDER` | `openai` oder `disabled` |
| `OPENAI_API_KEY` | OpenAI-API-Key (falls kein Storage-Wert über `app-config-repository.js` gesetzt ist) |

## Struktur

```
src/
  domain/            # reine Geschäftslogik, plattformunabhängig
  providers/llm/      # OpenAI-Anbindung, 1:1 aus dem Jira-Plugin übernommen
  services/           # Orchestrierung (Analyse, Fix-Vorschläge, Apply-Flow, ...)
  gateways/azure-devops/  # WIT-REST-API-Zugriff (Read/PATCH/WIQL)
  repositories/       # Storage-Zugriff — aktuell noch @forge/kvs, Schritt 2 offen
  utils/
tests/
```

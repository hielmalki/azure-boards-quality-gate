# Azure Boards Quality Gate

Backend-Code für die Azure-DevOps/Azure-Boards-Version von QualityGate AI.

Dieses Repository ist aus dem ursprünglichen Jira-Forge-Plugin ([`jiraPlugin`](../jiraPlugin))
herausgelöst. Backend (`src/`) und Frontend (`web/`, aus `jiraPlugin/static/hello-world`
übernommen) sind vollständig auf Azure DevOps umgestellt: kein Forge-Resolver, kein `@forge/bridge`,
kein `manifest.yml` mehr — stattdessen Azure-Functions-HTTP-Endpunkte, das ADO-Extension-SDK und
`vss-extension.json`.

## Quelle der Wahrheit

- [`docs/azure-boards-migration-architektur.md`](docs/azure-boards-migration-architektur.md) —
  Zielarchitektur, Schicht-für-Schicht-Analyse, empfohlene Umsetzungsreihenfolge (7 Schritte).
- [`docs/azure-boards-migration-umsetzung.md`](docs/azure-boards-migration-umsetzung.md) —
  Einsteiger-Kochrezept (wer macht was, Azure-Ressourcen-Setup).

## Stand der Migration

| Schritt | Status |
| --- | --- |
| 1. Backend-Host (Azure Functions) | 🟢 Functions-v4-Projektgerüst + alle Resolver-Äquivalente aus dem alten Forge-Resolver als HTTP-Endpunkte (`src/functions/*.js`, Schritt 6) lokal verifiziert (Unit-Tests). |
| 2. Repository-Schicht (Azure Table Storage) + Key Vault | ✅ Alle 7 Repositories laufen über `src/repositories/table-kv-store.js` (Azure Table Storage), Round-Trip gegen die echte Tabelle `qualityGateKeyValueStore` verifiziert. Der OpenAI-Key liegt jetzt in **Azure Key Vault** (`src/repositories/key-vault-store.js`, `DefaultAzureCredential`), sobald `AZURE_KEY_VAULT_URL` gesetzt ist; ohne Key Vault bleibt Table Storage lokaler Fallback. |
| 3. Auth (SDK-Token-Validierung, Admin-Gate) | ✅ `src/auth/{auth-context,sdk-token,require-auth,require-admin}.js`: Token-Passthrough (`Authorization: Bearer`) über einen request-scoped Auth-Kontext, Gateway nutzt Bearer-Token statt PAT sobald vorhanden (PAT bleibt lokaler Fallback), Admin-Gate über die ADO-Permissions-API (fail-closed). An alle Endpunkte aus Schritt 6 angebunden. Offen: Verifizierung der Security-Namespace-/Bitmask-Werte gegen die Ziel-Organisation. |
| 4. Gateway gegen Azure DevOps WIT-REST-API | ✅ `src/gateways/azure-devops/work-item-gateway.js` |
| 5. ADF → HTML, Akzeptanzkriterien natives Feld | ✅ `issue-service.js` (lesen), `azure-devops-apply-service-core.js` (schreiben) |
| 6. Resolver → HTTP-Endpunkte | ✅ Alle 27 Forge-Resolver aus `jiraPlugin/src/index.js` als `app.http`-Endpunkte in `src/functions/{work-items,analysis,fix-suggestions,rulesets,api-key,user-state,llm}.js` nachgebaut, hinter `withAuth`/`assertAdmin` (Schritt 3). Ausnahme: `fetchLabels` entfällt bewusst — Labels stecken über `System.Tags` bereits in `getNormalizedIssue`. |
| 7. `vss-extension.json` + Frontend | ✅ Frontend nach `web/` übernommen, `@forge/bridge` durch `azure-devops-extension-sdk` + einen `invoke()`-kompatiblen `fetch()`-Shim (`web/src/api/invoke.ts`) ersetzt; `vss-extension.json` deklariert eine Work-Item-Form-Page-Contribution mit den Scopes `vso.work`/`vso.work_write`. `npm run package` in `web/` baut ein installierbares `.vsix` (lokal verifiziert). Offen: echter End-to-End-Test in einer ADO-Test-Org (Freigabe/Install), Marketplace-PNG-Icon (aktuell SVG). |

**Wichtig:** Mit Schritt 2 laufen jetzt auch Endpunkte, die die Repository-Schicht berühren
(z. B. `analyzeIssue` über `ruleset-service.js`), außerhalb von Forge lauffähig — vorausgesetzt
`AZURE_STORAGE_CONNECTION_STRING`/`AzureWebJobsStorage` zeigt auf einen Storage Account mit der
Tabelle `qualityGateKeyValueStore` (siehe unten). Der OpenAI-Key selbst liegt nicht mehr als
Klartext in dieser Tabelle, sobald `AZURE_KEY_VAULT_URL` gesetzt ist (siehe Key-Vault-Abschnitt
unten).

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
curl -H "Authorization: Bearer <token>" http://localhost:7071/api/work-items/<id>
curl -X POST -H "Authorization: Bearer <token>" http://localhost:7071/api/work-items/<id>/analyze
```

Alle Endpunkte außer `/api/health` erfordern den `Authorization: Bearer <token>`-Header (Schritt 3).
Lokal kann ein PAT als Bearer-Wert eingesetzt werden; in der Extension liefert
`SDK.getAccessToken()` das echte Token (siehe `web/src/api/invoke.ts`, Schritt 7). Die vollständige
Endpunkt-Liste steht in
`src/functions/{work-items,analysis,fix-suggestions,rulesets,api-key,user-state,llm}.js`.

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

Auth über PAT ist ein pragmatischer Zwischenstand für lokale Entwicklung/CI. Sobald ein Request
einen `Authorization: Bearer <SDK-Token>`-Header trägt, verwendet das Gateway dieses Token statt
des PAT (siehe `src/auth/`, Schritt 3).

### Umgebungsvariablen (für das Admin-Gate)

| Variable | Zweck |
| --- | --- |
| `ADO_ADMIN_SECURITY_NAMESPACE_ID` | Überschreibt die Security-Namespace-ID der Permission-Prüfung (Default: `Project`-Namespace `52d39943-cb85-4d7f-8fa8-c6baac873819`). |
| `ADO_ADMIN_PERMISSION_BITMASK` | Überschreibt die geprüfte Berechtigungs-Bitmaske (Default: `2`, `GENERIC_WRITE`). Vor Produktivbetrieb gegen die Ziel-Organisation verifizieren. |

### Umgebungsvariablen (für den LLM-Provider)

| Variable | Zweck |
| --- | --- |
| `LLM_PROVIDER` | `openai` oder `disabled` |
| `OPENAI_API_KEY` | OpenAI-API-Key als letzter Fallback (falls weder Key Vault noch Table Storage einen Wert liefern) |

### Umgebungsvariablen (für die OpenAI-Key-Härtung / Azure Key Vault)

| Variable | Zweck |
| --- | --- |
| `AZURE_KEY_VAULT_URL` | z. B. `https://qualitygate-ai-kv.vault.azure.net`. Gesetzt → `app-config-repository.js` liest/schreibt den OpenAI-Key über `src/repositories/key-vault-store.js` (Key Vault) statt über Azure Table Storage. Ungesetzt → bisheriger Table-Storage-Pfad (lokaler Fallback). |
| `OPENAI_SECRET_NAME` | Name des Secrets im Vault, Default `openai-api-key`. |

Auth gegen Key Vault läuft über `DefaultAzureCredential` (System-assigned Managed Identity der
Function App in Azure, `az login`/Umgebungsvariablen lokal) — kein zusätzliches Secret nötig, um
selbst auf den Vault zuzugreifen.

**Einmaliges Azure-Setup (manuell, nicht Teil dieses Repos):**

```bash
az keyvault create --name qualitygate-ai-kv --resource-group qualitygate-ai-rg --location westeurope
az functionapp identity assign --name qualitygate-ai-api --resource-group qualitygate-ai-rg
az keyvault set-policy --name qualitygate-ai-kv --object-id <function-app-principal-id> \
  --secret-permissions get set delete
az functionapp config appsettings set --name qualitygate-ai-api --resource-group qualitygate-ai-rg \
  --settings AZURE_KEY_VAULT_URL=https://qualitygate-ai-kv.vault.azure.net
```

Danach den OpenAI-Key einmalig über `saveOpenAiApiKey`/`POST /api/api-key` (oder
`az keyvault secret set`) im Vault ablegen; der bisherige Klartext-Wert in der Tabelle kann
anschließend gelöscht werden.

### Umgebungsvariablen (für die Repository-Schicht / Azure Table Storage)

| Variable | Zweck |
| --- | --- |
| `AZURE_STORAGE_CONNECTION_STRING` | Verbindungsstring des Storage Accounts. Fällt auf `AzureWebJobsStorage` zurück (in der Function App bereits gesetzt). |
| `AZURE_TABLE_NAME` | Tabellenname, Default `qualityGateKeyValueStore`. |

Die Tabelle muss einmalig existieren (wurde für `qualitygateaifr` bereits angelegt):

```bash
az storage table create --name qualityGateKeyValueStore --account-name qualitygateaifr --auth-mode login
```

## Frontend (`web/`) und Extension-Paketierung

`web/` ist das aus `jiraPlugin/static/hello-world` übernommene React/Vite-Frontend (Schritt 7).
`@forge/bridge` wurde vollständig ersetzt:

- `azure-devops-extension-sdk` für `SDK.init()`/`SDK.ready()`/`SDK.getAccessToken()`
  (`web/src/main.tsx`).
- `web/src/api/invoke.ts` — Drop-in-Ersatz für `invoke()` aus `@forge/bridge` mit derselben
  Signatur `invoke<T>(name, payload)`. Bildet jeden bisherigen Forge-Resolver-Namen auf
  Methode + Pfad des passenden `src/functions/*`-Endpunkts ab und hängt das SDK-Bearer-Token an.
  Die 7 Aufrufer-Dateien (`api-key-data.ts`, `components/rulesets-data.ts`,
  `components/triage-panel/{use-analysis-flow.ts,use-fix-flow.ts,batch-fix-flow.tsx}`,
  `hooks/{useDuplicateCheck.ts,useTokenUsage.ts}`) mussten dafür nur ihren Import umstellen.
- `components/triage-panel/duplicate-section.tsx`: `router.open('/browse/KEY')` (Forge) →
  `window.open()` auf die Work-Item-Form-URL, gebaut aus `SDK.getHost()`/`SDK.getWebContext()`.

```bash
cd web
npm install
npm run build      # vite build -> web/build
npm run package    # baut + tfx extension create -> ../vsix-output/*.vsix
```

`VITE_API_BASE_URL` (Build-Env) überschreibt die Backend-URL, Default
`https://qualitygate-ai-api.azurewebsites.net`.

`vss-extension.json` (Repo-Root, ersetzt `manifest.yml`) deklariert eine
`ms.vss-work-web.work-item-form-page`-Contribution (eigener Tab im Work-Item-Formular) mit den
Scopes `vso.work`/`vso.work_write`. Veröffentlichen/Teilen mit einer ADO-Organisation läuft über
`tfx extension publish`/die Marketplace-UI (nicht Teil dieses Repos) — vor einer echten
Veröffentlichung noch ein PNG-Marketplace-Icon ergänzen (aktuell nur `web/public/icon.svg`, das für
die Work-Item-Tab-Contribution selbst ausreicht).

## Struktur

```
src/
  domain/            # reine Geschäftslogik, plattformunabhängig
  providers/llm/      # OpenAI-Anbindung, 1:1 aus dem Jira-Plugin übernommen
  services/           # Orchestrierung (Analyse, Fix-Vorschläge, Apply-Flow, ...)
  gateways/azure-devops/  # WIT-REST-API-Zugriff (Read/PATCH/WIQL)
  repositories/       # Azure-Table-Storage-KV-Store + Key-Vault-Store + 7 Repository-Wrapper
  auth/               # Auth-Kontext, Token-Validierung, withAuth/assertAdmin (Schritt 3)
  functions/          # Azure-Functions-v4-HTTP-Endpunkte, nach Domäne gruppiert (Schritt 6)
  utils/
web/                 # React/Vite-Frontend, ADO-Extension-SDK statt @forge/bridge (Schritt 7)
  src/api/invoke.ts   # invoke()-kompatibler fetch()-Shim gegen die Backend-Endpunkte
vss-extension.json   # ADO-Extension-Manifest (ersetzt manifest.yml)
tests/
```

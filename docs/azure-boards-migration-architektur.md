# Architektur-Übertragung: Jira (Forge) → Azure Boards (Azure DevOps)

Dieses Dokument beschreibt die Architektur-Übertragung des QualityGate-AI-Plugins von der
Atlassian-Forge-Plattform (Jira) nach Azure DevOps (Azure Boards). Es ist als Migrations-Baseline
gedacht: Es benennt, was 1:1 portierbar ist, was neu geschrieben werden muss und – wichtiger –
welche Kopplungen sich in Schichten verstecken, die auf den ersten Blick unverändert bleiben.

## Ausgangs-Mentalmodell und Korrektur

Die Arbeitsannahme lautet:

> Es ändern sich **Extension-UI (Resolver)** und **Gateway**. **Service**, **Domain** und
> **LLM-Provider** bleiben bestehen.

Diese Annahme ist als grobe Richtung korrekt, aber in zwei Punkten unvollständig. Beide sind
migrationskritisch und müssen früh eingeplant werden:

1. **Es gibt in Azure DevOps kein serverseitiges Gegenstück zum Forge-Resolver.**
   Der Resolver wird nicht „nach Azure umgeschrieben" – er hat dort schlicht keinen Ort zum Laufen.
   Das ist die zentrale Architekturentscheidung dieser Migration (siehe unten).

2. **Service und Domain sind nicht vollständig unverändert.** In der Service-Schicht steckt
   Atlassian-spezifische Format-Logik (ADF – Atlassian Document Format), die in Azure Boards
   nicht existiert. Außerdem hängen **alle Repositories** und die **Secret-Speicherung** an
   Forge-eigenen Diensten (`@forge/kvs`), die durch neue Infrastruktur ersetzt werden müssen.

Aus „zwei Schichten ändern sich" wird damit realistischer: **Backend braucht einen neuen Host +
zwei Schichten werden neu geschrieben + drei Querschnitts-Workstreams (Storage, Secrets, ADF).**

---

## Die zentrale Entscheidung: Wo lebt das Backend?

### Warum das die Kernfrage ist

Forge und Azure DevOps haben grundlegend unterschiedliche Erweiterungsmodelle:

| Aspekt | Forge (heute) | Azure DevOps |
| --- | --- | --- |
| Backend-Ausführung | Atlassian-gehostete FaaS (`nodejs24.x`), Resolver läuft serverseitig | **Keine gehostete Backend-Umgebung.** Extensions sind reine Client-Contributions (iframe) |
| Frontend | Custom UI (React) im iframe, ruft Resolver via `@forge/bridge` `invoke()` | React im iframe, `azure-devops-extension-sdk` |
| API-Zugriff | `api.asUser().requestJira(...)` – Atlassian proxyt & authentifiziert | Client hat ein SDK-Token; REST-Aufrufe erfolgen direkt oder über eigenes Backend |
| Storage | `@forge/kvs` (Forge Key-Value-Store) | Extension Data Service (client-seitig, limitiert) oder eigene DB |
| Secrets | Forge-Storage / Umgebungsvariablen | Kein serverseitiger Secret-Store in der Extension |

Der aktuelle Resolver (`src/index.js`) und die dahinterliegende Service-/Domain-/LLM-Logik laufen
**serverseitig und vertrauenswürdig**. Genau das ist in einer reinen ADO-Extension nicht möglich.

### Warum reiner Client-Code ausscheidet

Drei Gründe verbieten es, die Backend-Logik einfach in den iframe zu verschieben:

- **OpenAI-API-Key**: Wird admin-seitig, site-weit gesetzt (`api-key-service.js`). Im Client-JS
  wäre er für jeden Nutzer auslesbar.
- **Apply- & Audit-Workflow**: Das Zurückschreiben nach Azure Boards und das Audit-Log
  (`jira-apply-service-core.js`) müssen vertrauenswürdig und nachvollziehbar sein.
- **Admin-Gate**: Konfigurationsmutationen (Regelsets, API-Key) erfordern eine serverseitige
  Berechtigungsprüfung, die der Client nicht fälschungssicher leisten kann.

### Empfehlung

**Ein selbst gehostetes Backend ist faktisch verpflichtend.** Die einzige offene Frage ist der Host:

- **Empfohlen: Azure Functions** – am nächsten am bisherigen Forge-FaaS-Modell (funktionsbasiert,
  ereignisgetrieben, minimaler Betrieb). Jeder heutige Resolver wird zu einem HTTP-Endpunkt.
- Alternativen: Azure App Service / Container (wenn ein dauerhaft laufender Service oder komplexere
  Middleware gewünscht ist).

Das Backend übernimmt exakt die Rolle, die heute der Forge-Resolver spielt: Es kapselt Service-,
Domain- und LLM-Logik, hält Secrets, prüft Berechtigungen und ruft die Azure-DevOps-REST-API im
Namen des Nutzers auf. Die iframe-Extension ruft dieses Backend per `fetch()` mit dem
SDK-Access-Token auf.

```
Forge heute:
  [Custom UI iframe] --invoke()--> [Forge Resolver (Atlassian FaaS)] --> Jira REST
                                          |
                                   Service/Domain/LLM/Repos/Secrets

Azure DevOps Ziel:
  [ADO Extension iframe] --fetch(+token)--> [Azure Functions Backend] --> ADO REST
                                                    |
                                       Service/Domain/LLM (portiert) + neue Repos/Secrets
```

---

## Schichtweise Übertragung

### 1. Extension-UI / Resolver-Schicht — **wird neu geschrieben**

**Heute:** `src/index.js` definiert ~30 Resolver via `@forge/resolver`; das Frontend ruft sie über
`@forge/bridge` `invoke('name', payload)`.

**Ziel:**

- **Backend:** Jeder `resolver.define('x', fn)` wird ein HTTP-Endpunkt der Azure Function
  (z. B. `POST /api/x`). Die inneren `try/catch/logInfo/logError`-Muster bleiben erhalten; nur
  Signatur (`req.payload` / `req.context` → HTTP-Body / validiertes Token) und Rückgabe ändern sich.
- **Frontend:** Jeder `invoke('x', payload)`-Aufruf wird zu einem `fetch()` gegen das Backend mit
  `Authorization`-Header aus dem SDK-Token. Betroffene Stellen (nicht abschließend):
  `api-key-data.ts`, `rulesets-data.ts`, `use-analysis-flow.ts`, `batch-fix-flow.tsx`,
  `use-fix-flow.ts`, `useDuplicateCheck.ts`, `useTokenUsage.ts`.
- `@forge/bridge` → `azure-devops-extension-sdk` (`SDK.init()`, `SDK.getConfiguration()`,
  `SDK.getAccessToken()`); `router` (Deep-Links in `duplicate-section.tsx`) → ADO-Navigation.
- **Kontext:** `req.context.extension.issue.key` (Jira-Key) → Work-Item-ID aus dem
  Work-Item-Form-Kontext des SDK. `req.context.accountId` → ADO-Nutzeridentität aus dem Token.

### 2. Gateway-Schicht — **wird neu geschrieben**

**Heute:** `src/gateways/jira/jira-issue-gateway.js` – zwei Funktionen gegen `rest/api/3`:
`fetchIssueForAnalysis` (GET) und `updateIssueFields` (PUT `{ fields }`).

**Ziel – Azure DevOps Work Item Tracking REST API:**

- **Lesen:** `GET /_apis/wit/workItems/{id}?fields=...` bzw. Batch-Read.
- **Schreiben:** **`PATCH`** mit `Content-Type: application/json-patch+json` – Azure Boards nutzt
  ein JSON-Patch-Dokument (`[{ "op": "add", "path": "/fields/System.Title", "value": ... }]`),
  **nicht** ein `PUT { fields }` wie Jira.
- **Duplikatssuche:** Der heutige Duplicate-Check (`duplicate-check-service.js`) sucht per
  JQL/Summary. Das wird zu einer **WIQL**-Abfrage (`POST /_apis/wit/wiql`). Dieser Pfad gehört
  ausdrücklich ins neue Gateway und darf nicht übersehen werden.

**Feld- und Identifier-Mapping** (Prozess-Template **Agile** angenommen – siehe Hinweis unten):

| Intern / Jira | Azure Boards Feld |
| --- | --- |
| `issueKey` (`PROJ-123`) | numerische Work-Item-**ID** |
| `summary` | `System.Title` |
| `description` | `System.Description` (**HTML**, nicht ADF) |
| `acceptanceCriteria` | `Microsoft.VSTS.Common.AcceptanceCriteria` (**natives Feld!**) |
| `issuetype` | `System.WorkItemType` |
| `priority` | `Microsoft.VSTS.Common.Priority` |
| `status` | `System.State` |
| `labels` (Array) | `System.Tags` (**Semikolon-getrennter String**, kein Array) |
| `estimate` (Sekunden) | `Microsoft.VSTS.Scheduling.*` (Story Points / Stunden, **nicht** Sekunden) |

**Echter Gewinn:** Akzeptanzkriterien sind in ADO ein **eigenes Feld**
(`Microsoft.VSTS.Common.AcceptanceCriteria`). Heute wird in Jira mangels Feld der AC-Text in die
Beschreibung gequetscht (`buildUpdatedDescription`, `hasAcceptanceCriteria`). In ADO entfällt dieser
Workaround – AC kann sauber ins eigene Feld geschrieben/gelesen werden.

### 3. Domain-Schicht — **portierbar (nahezu unverändert)**

`src/domain/analysis/rule-definitions.js` und die Scoring-/Severity-Logik sind reine
Geschäftslogik ohne Plattformbezug und wandern unverändert mit.

**Ausnahme:** `src/domain/shared/description-sections.js` (`normalizeText`, `splitDescriptionSections`)
arbeitet auf Plain-Text und ist portierbar – aber die *Erzeugung* dieses Plain-Textes hängt am
ADF-Parsing (siehe ADF-Workstream). Die Domain-Logik bleibt, ihr Input-Format ändert sich.

### 4. Service-Schicht — **überwiegend portierbar, mit ADF-Kopplung**

Orchestrierung (`analysis-*`, `fix-suggestion-*`, `ruleset-*`, `ai-usage-*`) bleibt strukturell
gleich. **Aber** zwei Stellen enthalten Atlassian-Formatlogik, die fälschlich als „unverändert"
eingestuft würde:

- `src/services/issue-service.js` → `adfNodeToText` / `normalizeDescription` **liest** ADF und
  wandelt es in Plain-Text.
- `src/services/jira-apply-service-core.js` → `buildAdfDocument` **schreibt** ADF beim Apply.

Azure-Boards-Felder sind **HTML**, kein ADF. Beide Richtungen müssen umgestellt werden:
ADF-Parsing → HTML-Parsing (lesen), ADF-Erzeugung → HTML-Erzeugung (schreiben). Das ist ein
eigener Workstream, weil es mitten in der „bleibt gleich"-Schicht sitzt.

`jira-apply-service-core.js` sollte zudem `ALLOWED_APPLY_FIELDS` und die Konflikterkennung an das
ADO-Feldmodell anpassen (u. a. `acceptanceCriteria` als eigenes Zielfeld statt als
Beschreibungs-Anhängsel).

### 5. LLM-Provider-Schicht — **unverändert portierbar**

`src/providers/llm/*` spricht via reinem HTTPS (`globalThis.fetch`) mit OpenAI. Kein Forge-Bezug.
Diese Schicht wandert 1:1 ins neue Backend. Der Egress zu `api.openai.com` wird nicht mehr im
Forge-Manifest deklariert, sondern durch die Netzwerk-/Firewall-Konfiguration der Azure-Function
erlaubt.

### 6. Repository-Schicht — **muss neu geschrieben werden (nicht im Ausgangs-Scope)**

**Alle** Repositories (`analysis-repository.js`, `ruleset-repository.js`, `ai-usage-repository.js`,
`apply-audit-repository.js`, `app-config-repository.js`, `user-state-repository.js`, …) nutzen
`@forge/kvs`. Das ist weder Gateway noch LLM-Provider und war im ursprünglichen Scope nicht genannt,
muss aber ersetzt werden.

**Ziel:** persistenter Store am Backend – z. B. Azure Table Storage / Cosmos DB / Azure SQL. Die
Storage-Key-Konventionen (`storage-keys.js`) können als Partition-/Row-Key-Schema erhalten bleiben.
Der ADO Extension Data Service ist als Ersatz **nicht** ausreichend (client-seitig, limitiert,
nicht vertrauenswürdig für Audit/Verbrauch).

### 7. Secret-Speicherung — **muss neu geschrieben werden (Querschnitt)**

`api-key-service.js` + `app-config-repository.js` legen den OpenAI-Key in Forge-Storage ab. Ziel:
**Azure Key Vault** (oder App-Settings/Managed Identity), angebunden vom Backend. Der Key darf den
Server nie verlassen.

### Auth- & Berechtigungsmodell — **Querschnitt**

- `api.asUser().requestJira(...)` → Backend **validiert das SDK-Access-Token** des Nutzers und ruft
  die ADO-REST-API in dessen Namen (OAuth / On-Behalf-Of bzw. Token-Weitergabe).
- `assertAdmin()` via `GET /rest/api/3/mypermissions?permissions=ADMINISTER` → Prüfung über
  **ADO Security Namespaces / Permissions API**. Die heutige „fail-open"-Semantik sollte bei der
  Gelegenheit bewusst überprüft werden.

### Manifest / Verpackung — **wird ersetzt**

`manifest.yml` (Forge) → `vss-extension.json` (ADO). Statt Forge-Modulen/Scopes werden
**Contributions** (Work-Item-Form-Gruppe/-Panel) und **Scopes** (`vso.work`, `vso.work_write`)
deklariert. Der OpenAI-Egress wandert vom Manifest in die Backend-Infrastruktur.

---

## Wichtiger Vorbehalt: Prozess-Template

Das Feld- und State-Mapping hängt vom **Prozess-Template** der Ziel-Organisation ab
(**Agile** vs. **Scrum** vs. **CMMI**): `System.State`-Werte, verfügbare Work-Item-Typen und welche
Typen `AcceptanceCriteria` tragen, unterscheiden sich. Dieses Dokument nimmt **Agile** an. Vor der
Umsetzung entweder das Ziel-Template fixieren oder die Feld-/State-Tabelle parametrisieren.

---

## Zusammenfassung: Änderungsumfang je Schicht

| Schicht | Im Ausgangs-Scope? | Realer Aufwand |
| --- | --- | --- |
| Backend-Host (FaaS-Ersatz) | nicht genannt | **Neu – Voraussetzung für alles** |
| Extension-UI / Resolver | ja | Neu schreiben (Endpunkte + fetch/SDK) |
| Gateway | ja | Neu schreiben (WIT REST, PATCH, WIQL, Feldmapping) |
| Domain | „bleibt" | Portierbar ✔ |
| Service | „bleibt" | Portierbar, **außer ADF-Lese-/Schreiblogik** |
| LLM-Provider | „bleibt" | Portierbar ✔ |
| Repositories | nicht genannt | **Neu (KVS → Azure-Store)** |
| Secret-Speicherung | nicht genannt | **Neu (Key Vault)** |
| Auth / Admin-Gate | nicht genannt | **Neu (ADO-Permissions)** |
| Manifest | implizit (UI) | `manifest.yml` → `vss-extension.json` |

## Empfohlene Umsetzungsreihenfolge

1. Backend-Host (Azure Functions) aufsetzen; Domain- und LLM-Provider-Schicht 1:1 übernehmen.
2. Repository-Schicht auf Azure-Store umstellen; Secret-Store (Key Vault) anbinden.
3. Auth: SDK-Token-Validierung + ADO-Aufrufe im Nutzerkontext, Admin-Gate über ADO-Permissions.
4. Gateway gegen die WIT-REST-API neu implementieren (Read, PATCH-Write, WIQL-Duplikatssuche).
5. ADF → HTML in `issue-service` (lesen) und `jira-apply-service-core` (schreiben) umstellen;
   `acceptanceCriteria` auf das native ADO-Feld umziehen.
6. Resolver → HTTP-Endpunkte; Frontend `invoke()` → `fetch()`, `@forge/bridge` → ADO-SDK.
7. `vss-extension.json` erstellen, Contributions/Scopes deklarieren, End-to-End verifizieren.

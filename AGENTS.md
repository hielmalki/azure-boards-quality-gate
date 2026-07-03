# AGENTS.md

## Zweck

Dieses Repository verwendet KI-Coding-Agenten zur Unterstützung der Implementierung des
Azure-DevOps/Azure-Boards-Backends von QualityGate AI. Das Ziel ist es, funktionierenden Code zu
liefern **und** die Historie sauber, überprüfbar und sicher zu halten.

Agenten sollen bevorzugen:
- kleine, fokussierte Änderungen
- explizite Begründungen in Zusammenfassungen
- sichere, reversible Schritte
- saubere Git-Hygiene
- vorhersehbare Branch-Workflows, die in `main` landen können

---

## Repository-Kontext

Dieses Repository ist aus dem ursprünglichen Jira-Forge-Plugin (`jiraPlugin`) herausgelöst worden,
um die Azure-Boards-Migration von der laufenden Forge-Produktion zu trennen. Es enthält **nur**
den Backend-Code, der für die Azure-Migration relevant ist:

- `src/domain/*`, `src/providers/llm/*` — 1:1 aus dem Jira-Plugin übernommen (plattformneutral).
- `src/services/*` — Orchestrierung, bereits auf Azure-DevOps-Feldmodell umgestellt (HTML statt
  ADF, natives Akzeptanzkriterien-Feld).
- `src/gateways/azure-devops/*` — Gateway gegen die WIT-REST-API (ersetzt das frühere
  Jira-Gateway). Nutzt seit Schritt 3 das SDK-Bearer-Token aus dem Auth-Kontext, sobald vorhanden;
  PAT bleibt lokaler Fallback.
- `src/auth/*` — Request-scoped Auth-Kontext (`auth-context.js`), Token-Extraktion/-Validierung
  (`sdk-token.js`), `withAuth`-Wrapper für Function-Handler (`require-auth.js`) und das
  fail-closed Admin-Gate über ADO-Permissions (`require-admin.js`). Schritt 3, an alle Endpunkte
  in `src/functions/*` angebunden (Schritt 6).
- `src/repositories/*` — migriert auf Azure Table Storage (`table-kv-store.js`), Round-Trip gegen
  die echte Tabelle `qualityGateKeyValueStore` verifiziert. Der OpenAI-Key wird über
  `key-vault-store.js` in Azure Key Vault gehalten, sobald `AZURE_KEY_VAULT_URL` gesetzt ist
  (`DefaultAzureCredential`); ohne Key Vault bleibt Table Storage lokaler Fallback
  (`app-config-repository.js`). Schritt 2 damit abgeschlossen.
- `src/functions/*` — Azure-Functions-v4-HTTP-Endpunkte, nach Domäne gruppiert
  (`work-items`, `analysis`, `fix-suggestions`, `rulesets`, `api-key`, `user-state`, `llm`).
  Alle 27 Resolver-Äquivalente aus dem alten Forge-Resolver (`jiraPlugin/src/index.js`) sind
  nachgebaut (Schritt 6), jeweils hinter `withAuth`; Config-Mutationen zusätzlich hinter
  `assertAdmin`. Ausnahme: `fetchLabels` entfällt bewusst (Labels stecken bereits über
  `System.Tags` in `getNormalizedIssue`). Jeder Handler ist über `__testUtils` testbar
  (siehe `tests/*-functions.test.js`).
- `web/*` — aus `jiraPlugin/static/hello-world` übernommenes React/Vite-Frontend, vollständig auf
  das ADO-Extension-SDK umgestellt (Schritt 7): `@forge/bridge` `invoke()` → `web/src/api/invoke.ts`
  (derselbe `invoke<T>(name, payload)`-Vertrag, mappt auf `fetch()` gegen `src/functions/*` +
  SDK-Bearer-Token), `router.open()` → `window.open()` mit einer aus `SDK.getHost()`/
  `SDK.getWebContext()` gebauten Work-Item-URL. Kein Frontend-Test-Setup vorhanden — Verifikation
  über `tsc --noEmit`, `vite build`, `tfx extension create` und manuellen E2E-Test in einer
  ADO-Test-Org.
- `vss-extension.json` (Repo-Root) — ersetzt `manifest.yml`: `ms.vss-work-web.work-item-form-page`-
  Contribution, Scopes `vso.work`/`vso.work_write`. `web/package.json` (`npm run package`) baut
  das `.vsix` via `tfx-cli`.

**Nicht** Teil dieses Repos (bewusst, Stand der Extraktion):
- Forge-Resolver (`src/index.js` im jiraPlugin-Repo), `manifest.yml`, Forge-Deploy-Skripte —
  komplett Forge-spezifisch und vollständig ersetzt (siehe oben); nur noch als historische
  Referenz im jiraPlugin-Repo vorhanden.

Bei jeder Aufgabe zuerst `docs/azure-boards-migration-architektur.md` konsultieren, um zu prüfen,
in welchem Schritt der geplanten Reihenfolge die Aufgabe liegt und welche Annahmen (z. B.
Prozess-Template „Agile") gelten.

---

## Allgemeine Arbeitsregeln

1. Keine großen, nicht zusammenhängenden Änderungen in einer Aufgabe.
2. Nur Dateien bearbeiten, die für die Anfrage relevant sind.
3. Architektur und Benennung beibehalten, sofern kein Refactoring explizit angefordert wurde.
4. Unnötige Abstraktionen vermeiden.
5. Lesbarkeit und Wartbarkeit gegenüber Cleverness bevorzugen.
6. Diffs klein genug für PR-Reviews halten.
7. Lokalen Kontext (und die Migrations-Doku) vor der Implementierung inspizieren.
8. Bei unklaren Anforderungen die sicherste minimale Implementierung wählen und Annahmen
   dokumentieren.
9. Fehlgeschlagene Prüfungen/Fehler nicht stillschweigend ignorieren.
10. Immer zusammenfassen, was geändert wurde, was verifiziert wurde und etwaige Folgeaufgaben.

---

## Git & Branch-Richtlinie

### Sicherheit für `main`
- Nie direkt auf `main`/`master` implementieren.
- Feature-Branches für alle Code-Änderungen verwenden.

### Branch-Benennung
- `feature/<kurze-beschreibung>`
- `bugfix/<kurze-beschreibung>`
- `refactor/<kurze-beschreibung>`
- `chore/<kurze-beschreibung>`

Kleinschreibung + Bindestriche verwenden.

**Harte Regeln — Branch- und PR-Erstellung:**
- **Niemals einen neuen Branch erstellen, es sei denn, der User fragt explizit danach.**
- **Niemals einen PR öffnen, es sei denn, der User fragt explizit danach.**
- Standardmäßig auf dem aktuellen Branch arbeiten. Nur wechseln oder branchen, wenn angewiesen.
- Niemals einen neuen Branch von einem anderen Feature-/Refactor-/Bugfix-Branch erstellen – immer
  von `main`.
- Vor dem Branching immer `git pull` auf `main` ausführen.

### Commits
- Bedeutsamen Fortschritt mit klaren Nachrichten committen.
- Keine nicht zusammenhängenden Änderungen in einem Commit mischen.
- **Niemals** `Co-Authored-By`-Trailer zu Commit-Nachrichten hinzufügen.

---

## PR & Merge-Richtlinie

- PR öffnen, wenn die Arbeit überprüfbar und nützlich ist.
- PRs fokussiert halten und bei Bedarf kurze Risiko-/Folgehinweise einfügen.
- Nur mergen, wenn es Berechtigungen/Regeln erlauben und Checks bestanden sind.

Wenn PR/Merge blockiert ist (Berechtigungen, CI, Genehmigungen, Konflikte), explizit berichten:
1. Blockertyp
2. Genauer nächster Schritt
3. Was bereits abgeschlossen ist

---

## Build-, Test- und Verifizierungsrichtlinie

Vor dem Abschluss einer Aufgabe relevante Prüfungen ausführen:

```bash
npm test               # Backend
cd web && npx tsc --noEmit && npm run build   # Frontend, bei Änderungen an web/
```

Es gibt noch keinen Deploy-Schritt in diesem Repo (weder Function-App-CI/CD noch automatisierte
`.vsix`-Veröffentlichung). Wenn eine Prüfung fehlschlägt, beheben oder klar berichten, warum es
jetzt nicht behoben werden kann.

---

## Code-Qualitätserwartungen

Code soll sein:
- lesbar
- minimal-invasiv
- konsistent mit der aktuellen Struktur
- einfach zu überprüfen und rückgängig zu machen

Vermeiden:
- spekulative/breite Refactors
- Formatierungschaos gemischt mit funktionalen Änderungen
- toter Code / ungenutzte Imports
- Abhängigkeiten ohne klaren Bedarf hinzufügen
- Jira-/Forge-spezifische Begriffe oder Annahmen in neuem Code (dieses Repo ist Azure-DevOps-Ziel)

---

## Testerwartungen

- Tests für bedeutsame Verhaltensänderungen in berührten Bereichen hinzufügen/aktualisieren.
- Keine gefälschte Testabdeckung.
- Fehlgeschlagene Tests nicht ignorieren.
- Wenn Tests nicht ausgeführt werden können, dies explizit angeben.

Grundsatz: Geändertes Verhalten testen, nicht alles.

---

## Dokumentationserwartungen

Dokumente aktualisieren, wenn sich Verhalten oder Migrationsstand wesentlich ändern. Typische
Ziele:
- `README.md` (Stand-der-Migration-Tabelle)
- `docs/azure-boards-migration-architektur.md` / `-umsetzung.md`, falls sich die Zielarchitektur
  oder Annahmen ändern

Übermäßige Dokumentation für triviale interne Bearbeitungen vermeiden.

---

## Anforderungen an die Aufgaben-Abschlussausgabe

Immer eine prägnante Statuszusammenfassung liefern mit:
1. Was geändert wurde
2. Verwendeter Branch
3. Ausgeführte Prüfungen und Ergebnisse
4. Ob committed/gepusht wurde
5. Ob PR erstellt/gemergt wurde (oder Blocker)
6. Folgeaufgaben (idealerweise mit Bezug auf den betroffenen Migrationsschritt)

---

## Verbotenes Verhalten

Nicht:
- direkt auf `main`/`master` implementieren
- lokale Änderungen stillschweigend verwerfen
- Branch-Protektionen umgehen
- Blocker verstecken
- nicht zusammenhängende Aufgaben ohne Erklärung in einem Commit/Branch mischen
- Jira/Forge-Abhängigkeiten (`@forge/api`, `@forge/resolver`, `@forge/kvs`, `@forge/bridge`) wieder
  einführen — dieses Repo ist vollständig Forge-frei (Schritt 2 hat `@forge/kvs` durch Azure Table
  Storage ersetzt, Schritt 7 hat `@forge/bridge` im Frontend durch `azure-devops-extension-sdk`
  ersetzt)

---

## Bevorzugter Workflow (Referenz)

1. Aktuellen Branch und Working Tree prüfen.
2. Prüfen, welcher Migrationsschritt betroffen ist (Architektur-Doku).
3. Branching-Entscheidung treffen: kleine Aufgabe → aktueller Branch; große/nicht zusammenhängende
   Aufgabe → zunächst aktuellen Branch via PR nach `main` landen, dann neuen Branch von `main`.
4. Minimale, fokussierte Änderungen implementieren.
5. `npm test` ausführen.
6. Bedeutsamen Fortschritt committen (keine `Co-Authored-By`-Trailer).
7. Pushen / PR erstellen, wenn angemessen.
8. Klar zusammenfassen mit Blockern/Folgeaufgaben, falls vorhanden.

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
  Jira-Gateway).
- `src/repositories/*` — migriert auf Azure Table Storage (`table-kv-store.js`), Round-Trip gegen
  die echte Tabelle `qualityGateKeyValueStore` verifiziert. Offen: der OpenAI-Key liegt noch als
  Klartext in der Tabelle statt in Key Vault (Härtung, Teil von Schritt 2).
- `src/functions/*` — Azure-Functions-v4-HTTP-Endpunkte. Bisher nur ein schmaler Vertikalschnitt
  (`health`, `getWorkItem`); die übrigen ~28 Resolver-Äquivalente aus dem alten Forge-Resolver
  fehlen noch (Schritt 6).

**Nicht** Teil dieses Repos (bewusst, Stand der Extraktion):
- Forge-Resolver (`src/index.js` im jiraPlugin-Repo), `manifest.yml`, Forge-Deploy-Skripte —
  komplett Forge-spezifisch, wird durch die Endpunkte in `src/functions/*` und
  `vss-extension.json` (Schritt 7) ersetzt.
- Frontend (`static/hello-world`) — noch vollständig `@forge/bridge`-basiert, nicht migriert.

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
npm test
```

Es gibt (noch) keinen Frontend-Build und keinen Deploy-Schritt in diesem Repo (siehe Schritt 1/6/7
in der Architektur-Doku). Wenn eine Prüfung fehlschlägt, beheben oder klar berichten, warum es
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
- Jira/Forge-Abhängigkeiten (`@forge/api`, `@forge/resolver`, `@forge/kvs`) wieder einführen —
  dieses Repo ist vollständig Forge-frei (Schritt 2 hat `@forge/kvs` durch Azure Table Storage
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

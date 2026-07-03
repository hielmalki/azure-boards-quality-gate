# Umsetzungsanleitung: Migration nach Azure Boards (für Azure-Einsteiger)

Begleitdokument zu [`azure-boards-migration-architektur.md`](./azure-boards-migration-architektur.md).
Dieses Dokument ist ein Schritt-für-Schritt-Kochrezept. Es setzt **kein** Azure-Vorwissen voraus und
markiert bei jedem Schritt klar:

- 🧑 **DU** – etwas, das nur ein Mensch tun kann (Konto anlegen, Bezahlen, interaktives Login,
  Entscheidungen, Freigaben).
- 🤖 **CLAUDE** – etwas, das Claude Code übernehmen kann (Code schreiben, Skripte/Konfiguration
  erzeugen, Befehle nach deinem Login ausführen, lokale Builds/Tests).

> **Faustregel:** Alles, was ein Passwort, eine Kreditkarte, einen Browser-Login oder eine
> Ja/Nein-Freigabe braucht, machst **du**. Alles, was Tippen von Code oder Befehlen ist, kann
> **Claude** – oft aber erst, *nachdem* du dich eingeloggt hast.

---

## 0. Die wichtigsten Begriffe (einmal lesen, dann verständlich)

Azure ist zweigeteilt, und das verwirrt am Anfang am meisten:

| Begriff | Was es ist | Analogie zu Forge/Jira |
| --- | --- | --- |
| **Azure DevOps (ADO) Organization** | Wo deine Boards/Work Items leben (`dev.azure.com/deineOrg`) | Deine Jira-Site |
| **Azure Subscription** | Der Ort, wo *Server-Ressourcen* laufen und abgerechnet werden (`portal.azure.com`) | Es gibt kein Forge-Äquivalent – Forge hostete das für dich |
| **Resource Group** | Ordner, der zusammengehörige Ressourcen bündelt | Ein Projekt-Ordner |
| **Function App** | Dein serverloses Backend (ersetzt den Forge-Resolver) | Der Forge-Resolver |
| **Storage Account / Table Storage** | Datenspeicher (ersetzt `@forge/kvs`) | Forge KVS |
| **Application Settings** | Umgebungsvariablen/Secrets der Function App | Forge-Env / Storage für den API-Key |
| **Marketplace Publisher** | Dein Verlags-Konto, um die Extension zu veröffentlichen | Der Forge-App-Owner |
| **`vss-extension.json`** | Manifest der ADO-Extension | `manifest.yml` |

**Kernaussage:** ADO-Organization und Azure-Subscription sind **zwei getrennte Konten**, die du
beide brauchst. Die Extension-Oberfläche lebt in ADO; das Backend lebt in der Subscription.

---

## Überblick: Wer macht was?

| Phase | 🧑 Du | 🤖 Claude |
| --- | --- | --- |
| 1. Konten anlegen | ADO-Org, Azure-Subscription, Marketplace-Publisher | — (nur Anleitung) |
| 2. Tools installieren | Installer bestätigen | Befehle vorbereiten/ausführen |
| 3. Einloggen | Interaktive Logins (`az login` etc.) | — |
| 4. Azure-Ressourcen anlegen | Freigabe erteilen, Namen wählen | Skript schreiben & ausführen |
| 5. Backend-Code | Reviewen | Kompletten Code schreiben |
| 6. Secrets setzen | OpenAI-Key liefern | Setz-Befehl schreiben/ausführen |
| 7. Gateway + ADF | Reviewen | Kompletten Code schreiben |
| 8. Frontend + Manifest | Reviewen | Kompletten Code schreiben |
| 9. Deploy | Freigabe erteilen | Deploy-Befehle ausführen |
| 10. Veröffentlichen & installieren | Im Browser bestätigen/teilen | `.vsix` bauen |
| 11. Verifizieren | Im ADO klicken/prüfen | Logs prüfen, Fehler fixen |

---

## Phase 1 — Konten anlegen 🧑 (nur du)

Das kann Claude **nicht** – hier braucht es E-Mail, ggf. Kreditkarte und Browser.

1. **Azure DevOps Organization**
   - Auf <https://dev.azure.com> mit einem Microsoft-Konto anmelden → „New organization".
   - Ein Projekt mit **Prozess-Template „Agile"** anlegen (die Architektur-Doku geht von Agile aus).
   - Ein paar Work Items (User Stories) anlegen, damit du später etwas zum Testen hast.

2. **Azure Subscription** (für das Backend)
   - Auf <https://portal.azure.com> ein kostenloses Azure-Konto erstellen
     (<https://azure.microsoft.com/free>). Es verlangt eine Kreditkarte zur Verifizierung, hat aber
     ein Startguthaben und einen „Always free"-Rahmen. Function App (Consumption) + Table Storage
     kosten bei diesem Projekt praktisch nichts.
   - Merke dir den **Subscription-Namen**.

3. **Marketplace Publisher** (erst kurz vor dem Veröffentlichen nötig)
   - Auf <https://marketplace.visualstudio.com/manage> einen Publisher erstellen.
   - Merke dir die **Publisher-ID** (kommt später ins Manifest).
   - bereits erstellt: Publisher-ID: `HichamElMalki`

> ✅ **Sag Claude Bescheid**, sobald das steht – am besten mit: ADO-Org-Name, Subscription-Name,
> Region (z. B. `westeurope`), Publisher-ID. Damit kann Claude alle folgenden Skripte konkret
> ausfüllen.

---

## Phase 2 — Werkzeuge installieren 🤖 (Claude bereitet vor, du bestätigst)

Diese Tools laufen auf deinem Rechner:

| Tool | Wozu | Prüfbefehl |
| --- | --- | --- |
| **Node.js 18+** | Backend & Frontend bauen | `node -v` |
| **Azure CLI (`az`)** | Azure-Ressourcen verwalten | `az version` |
| **Azure Functions Core Tools** | Backend lokal starten & deployen | `func --version` |
| **tfx-cli** | ADO-Extension paketieren/veröffentlichen | `tfx version` |

- 🤖 **Claude kann:** prüfen, was schon installiert ist, und die Installationsbefehle
  (z. B. via Homebrew / npm) ausführen.
- 🧑 **Du musst evtl.:** ein Admin-Passwort für einen Installer eingeben.

---

## Phase 3 — In Azure einloggen 🧑 (nur du, interaktiv)

Logins öffnen einen Browser und können **nicht** von Claude gemacht werden. Führe sie in dieser
Session selbst aus, indem du sie mit `!` voranstellst – dann landet die Ausgabe direkt hier:

```
! az login
! az account set --subscription "<dein-subscription-name>"
```

Danach ist Claude „eingeloggt genug": Die `az`-Befehle in den nächsten Phasen kann Claude mit deiner
Sitzung ausführen.

Für das spätere Extension-Publishing brauchst du zusätzlich einen **Personal Access Token (PAT)**
aus ADO (Marketplace-Scope). Den erstellst du im Browser (ADO → User Settings → Personal Access
Tokens) – das machst nur du, und du gibst ihn erst in Phase 10 ein.

---

## Phase 4 — Azure-Ressourcen anlegen 🤖 (Claude schreibt & führt aus, du gibst frei)

Jetzt entsteht die Infrastruktur. 🤖 **Claude kann ein Setup-Skript schreiben und – nach deinem
`az login` – ausführen.** 🧑 **Du gibst die Ausführung frei** (es werden echte, ggf.
kostenpflichtige Ressourcen erstellt).

Das Skript legt an:

1. **Resource Group** – der Sammelordner.
2. **Storage Account** – wird von der Function App ohnehin gebraucht und dient zugleich als
   Datenspeicher (Table Storage) für die Repository-Schicht.
3. **Function App** (Consumption/serverless, Node.js) – dein Backend.

Grobe Struktur (Claude füllt Namen/Region aus):

```bash
az group create --name qualitygate-ai-rg --location westeurope
az storage account create --name qualitygateai<zufall> --resource-group qualitygate-ai-rg --sku Standard_LRS
az functionapp create --name qualitygate-ai-api --resource-group qualitygate-ai-rg \
  --storage-account qualitygateai<zufall> --consumption-plan-location westeurope \
  --runtime node --functions-version 4
```

> Merke dir die **Function-App-URL** (`https://qualitygate-ai-api.azurewebsites.net`) – die trägt
> Claude später ins Frontend ein.

---

## Phase 5 — Backend-Code schreiben 🤖 (fast alles Claude)

Das ist der große Code-Block – **Claude übernimmt den Löwenanteil**, du reviewst.

🤖 **Claude kann:**
- Azure-Functions-Projekt aufsetzen und die **portierbaren Schichten 1:1 übernehmen**:
  `src/domain/*`, `src/providers/llm/*`, den Großteil von `src/services/*`.
- Für jeden heutigen Resolver aus `src/index.js` einen **HTTP-Endpunkt** anlegen
  (`POST /api/analyzeIssue`, `/api/getRulesetsState`, …), inklusive der bestehenden
  `try/catch`- und Logging-Muster.
- Die **Token-Validierung** einbauen (das SDK-Token des Nutzers prüfen), analog zum heutigen
  `req.context`.

🧑 **Du:** Code-Review, Fragen stellen. Keine Azure-Kenntnisse nötig.

---

## Phase 6 — Secrets & Konfiguration setzen 🤖+🧑

Der OpenAI-Key darf nur im Backend liegen (nie im Browser).

- 🧑 **Du:** lieferst den OpenAI-API-Key-Wert (Claude soll ihn nicht raten/erfinden).
- 🤖 **Claude kann:** ihn als **Application Setting** der Function App setzen:

```bash
az functionapp config appsettings set --name qualitygate-ai-api \
  --resource-group qualitygate-ai-rg --settings OPENAI_API_KEY="<dein-key>"
```

> **Einsteiger-Empfehlung:** Mit Application Settings starten (einfach, sicher genug – nicht
> client-sichtbar). **Azure Key Vault** ist die spätere Härtung, kein Startschritt.

---

## Phase 7 — Gateway + ADF-Umstellung 🤖 (Claude)

🤖 **Claude schreibt:**
- Neues **Azure-DevOps-Gateway** (ersetzt `jira-issue-gateway.js`): Lesen via WIT-REST,
  **Schreiben via `PATCH` json-patch**, Duplikatssuche via **WIQL**.
- **ADF → HTML**: `adfNodeToText`/`normalizeDescription` (lesen) und `buildAdfDocument` (schreiben)
  auf HTML umstellen.
- **Feld-Mapping** (`System.Title`, `System.Description`, `System.Tags`, …) und Akzeptanzkriterien
  auf das native ADO-Feld `Microsoft.VSTS.Common.AcceptanceCriteria`.

🧑 **Du:** ggf. bestätigen, welches Prozess-Template gilt (Agile angenommen), und reviewen.

---

## Phase 8 — Frontend + Manifest 🤖 (Claude)

🤖 **Claude schreibt/ändert im Frontend (`static/hello-world`):**
- `@forge/bridge` `invoke('x', payload)` → `fetch()` gegen die Function-App-URL + SDK-Token.
- `@forge/bridge` → `azure-devops-extension-sdk` (`SDK.init()`, `getAccessToken()`).
- Neues **`vss-extension.json`** (ersetzt `manifest.yml`): Work-Item-Form-Contribution,
  Scopes `vso.work` / `vso.work_write`, Publisher-ID.

🧑 **Du:** reviewen.

---

## Phase 9 — Deployen 🤖 (Claude führt aus, du gibst frei)

- 🤖 **Claude kann:** Frontend bauen (`npm run build`) und das Backend deployen:
  ```bash
  func azure functionapp publish qualitygate-ai-api
  ```
- 🧑 **Du:** die Ausführung freigeben (outward-facing Aktion).

---

## Phase 10 — Extension veröffentlichen & teilen 🧑 (überwiegend du)

- 🤖 **Claude kann:** das Extension-Paket bauen: `tfx extension create` erzeugt eine `.vsix`.
- 🧑 **Du musst:**
  - Deinen **PAT** (aus Phase 3) für `tfx` bereitstellen, bzw. die `.vsix` im Browser auf
    <https://marketplace.visualstudio.com/manage> hochladen.
  - Die Extension mit deiner **ADO-Organization teilen** (Share) und
  - im ADO-Org-Admin **installieren** und die angeforderten **Scopes bestätigen**.

Diese Freigaben sind Browser-/Konto-Aktionen und bleiben bei dir.

---

## Phase 11 — Verifizieren 🧑+🤖

- 🧑 **Du:** Öffne ein Work Item in ADO, das QualityGate-Panel sollte erscheinen; Analyse laufen
  lassen, einen Fix anwenden.
- 🤖 **Claude kann:** bei Fehlern die Function-Logs prüfen (`az functionapp log`), Ursachen finden
  und Code fixen.

---

## Realistische Reihenfolge fürs erste Mal

1. 🧑 Phase 1 (Konten) + Phase 3 (Logins) – **das ist deine Hauptaufgabe am Anfang.**
2. 🤖 Phase 2, 4 – Claude richtet Tools & Infrastruktur ein (mit deinen Freigaben).
3. 🤖 Phase 5–8 – Claude schreibt den Code; du reviewst.
4. 🧑🤖 Phase 6, 9 – Secret setzen, deployen.
5. 🧑 Phase 10 – veröffentlichen & installieren.
6. 🧑🤖 Phase 11 – testen & nachbessern.

**Dein Anteil** konzentriert sich auf Konten, Logins, den OpenAI-Key und ein paar
Browser-Freigaben. **Claude** übernimmt praktisch den gesamten Code und die Azure-CLI-Befehle –
Letztere allerdings erst, nachdem du dich eingeloggt hast.

> **Nächster konkreter Schritt für dich:** Phase 1 erledigen und Claude die vier Werte nennen
> (ADO-Org-Name, Subscription-Name, Region, Publisher-ID). Ab da kann Claude loslegen.

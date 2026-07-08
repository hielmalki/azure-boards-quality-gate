# ING-Bank-Deployment: Management-Überblick, E-Mail-Entwurf & Security-Befund

Dieses Dokument enthält (1) einen versandfertigen E-Mail-Entwurf für das Management,
(2) die fachlichen Details dahinter (Voraussetzungen, Rechte, Kosten, Zeitplan, Datenschutz),
(3) erwartbare Gegenfragen der Bank mit Antworten und (4) den vollständigen
Security-Befund aus dem Code-Review vom 2026-07-08.

---

## 1. E-Mail-Entwurf (versandfertig)

> **Betreff:** QualityGate AI – Überblick für das Gespräch mit der ING: Deployment, Datenschutz, Kosten, Zeitplan
>
> Hallo [Name],
>
> anbei die wichtigsten Punkte zu QualityGate AI für das Gespräch mit der ING – kompakt
> zusammengefasst, Details stehen im angehängten Dokument.
>
> **Was das Tool macht:** QualityGate AI ist eine Azure-DevOps-Extension, die Work Items
> (User Stories) direkt im Boards-Formular auf Anforderungsqualität prüft: KI-gestützte
> Analyse von Beschreibung und Akzeptanzkriterien, konkrete Verbesserungsvorschläge,
> Duplikaterkennung und automatische Testfall-Generierung inklusive Anlage als
> Azure-Test-Case-Work-Items mit „Tested By“-Verknüpfung. Gerade der letzte Punkt ist für
> eine Bank relevant: Er erzeugt eine lückenlos nachweisbare Spur von der Anforderung zum
> Test – genau das, was Audits sehen wollen.
>
> **Wie es bei der ING deployed wird:** Alles läuft im eigenen Azure-Tenant der Bank –
> es gibt keinen externen SaaS-Dienst und keinen Fremd-Betreiber. Benötigt werden vier
> Azure-Ressourcen (Function App, Storage Account, Key Vault, Azure OpenAI in einer
> EU-Region) plus die Extension-Installation in der Azure-DevOps-Organisation der Bank.
>
> **Datenschutz:** Verarbeitet werden ausschließlich Work-Item-Texte (Titel,
> Beschreibung, Akzeptanzkriterien). Für den Bankbetrieb ist Azure OpenAI in der
> EU-Region im Tenant der Bank vorgesehen – die Daten verlassen weder Azure noch die EU
> und werden von Microsoft vertraglich zugesichert nicht zum Modelltraining verwendet.
> Die Authentifizierung läuft über das persönliche Azure-DevOps-Token des jeweiligen
> Nutzers (kein Sammel-Service-Account), Secrets liegen im Key Vault, der Zugriff der
> Function App läuft über Managed Identity – es liegt kein Schlüssel im Klartext herum.
>
> **Erste Schritte:** (1) Azure-Subscription/Resource-Group bei der ING, (2) interne
> Freigabe für Azure OpenAI, (3) Ressourcen anlegen und Backend deployen (~1–2 Tage
> technischer Aufwand), (4) Extension bauen und in der ADO-Organisation hochladen,
> (5) Pilot mit einem Team. Der Quellcode wird in ein internes Repo der Bank übernommen
> – empfohlen: Azure Repos in derselben Azure-DevOps-Organisation.
>
> **Kosten:** Die Infrastruktur ist bewusst schlank – für einen Pilot realistisch unter
> 150 €/Monat, davon der Großteil nutzungsabhängige Azure-OpenAI-Token-Kosten. Mit
> Enterprise-Härtung (Private Endpoints, Monitoring, WAF) eher 250–500 €/Monat.
>
> **Zeitplan:** Rein technisch ist das Deployment eine Sache von 2–5 Arbeitstagen.
> Realistisch inklusive Bank-Prozessen (Subscription-Bereitstellung, Security-Review,
> Azure-OpenAI-Freigabe, ggf. Betriebsrat/Compliance wegen KI-Einsatz) sollten wir
> 6–10 Wochen bis zum laufenden Pilot einplanen – der Engpass sind die
> Genehmigungsprozesse, nicht die Technik.
>
> **Sicherheitsstatus:** Ich habe den kompletten Quellcode durchgesehen. Es gibt
> **keine kritischen Schwachstellen** – keine hartkodierten Secrets, alle fachlichen
> API-Endpunkte erfordern Authentifizierung, Admin-Aktionen sind fail-closed absichert,
> KI-Ausgaben werden vor Anzeige und Rückschreiben sanitisiert, die Abhängigkeitsprüfung
> des Backends ist ohne Befund. Vor dem Produktivbetrieb bei der Bank sind fünf
> Härtungspunkte umzusetzen (u. a. CORS auf die Extension-Domain einschränken,
> HTTPS-Erzwingung im Storage-Client, Log-Inhalte reduzieren) – alle klein und im
> Anhang beschrieben.
>
> Für Rückfragen der Bank habe ich im Anhang eine Liste der erwartbaren Gegenfragen mit
> Antworten vorbereitet (Abschnitt 6).
>
> Viele Grüße
> [Dein Name]

---

## 2. Deployment bei der ING – die Fakten im Detail

### 2.1 Architektur (wo läuft was)

```
Nutzer im Work-Item-Formular (Azure Boards)
   └─ Extension-Tab „QualityGate AI“ (iframe, React) – läuft im Browser des Nutzers
        └─ HTTPS + Bearer-Token → Azure Function App (Node.js, Bank-Tenant)
             ├─ Azure DevOps REST API   (mit dem Token des angemeldeten Nutzers)
             ├─ Azure OpenAI, EU-Region (Managed Identity, kein API-Key)
             ├─ Azure Table Storage     (Analyse-Stände, Rulesets, Audit-Einträge)
             └─ Azure Key Vault         (Secrets; bei Azure OpenAI faktisch leer)
```

Kein Bestandteil läuft außerhalb des Azure-Tenants der Bank. Es gibt keine Telemetrie
an den Hersteller und keine Drittanbieter-Aufrufe außer den konfigurierten
Azure-Diensten. Wichtig: Die Standard-Backend-URL im Frontend-Build
(`VITE_API_BASE_URL`) **muss** beim Bank-Build auf das Bank-Backend gesetzt werden
(siehe Security-Befund M-4).

### 2.2 Voraussetzungen

| # | Voraussetzung | Wer liefert das |
| --- | --- | --- |
| 1 | Azure-Subscription + Resource Group (EU-Region, z. B. West Europe) | Cloud-Team der Bank |
| 2 | Freigabe/Provisionierung Azure OpenAI (EU-Region, z. B. GPT-4o-mini-Deployment) | Cloud-/AI-Governance der Bank |
| 3 | Azure-DevOps-Organisation mit Boards im Einsatz | besteht bei der Bank |
| 4 | Berechtigung, Extensions in der ADO-Organisation hochzuladen | ADO-Org-Owner |
| 5 | Internes Git-Repository für den Quellcode | DevOps-Team |
| 6 | Optional: Application Insights / Log Analytics für Monitoring | Cloud-Team |

### 2.3 Erste Schritte (konkrete Reihenfolge)

1. **Quellcode übernehmen** in ein internes Repo der Bank (Empfehlung: **Azure Repos**
   in derselben ADO-Organisation – gleiche Zugriffskontrolle, gleiche Audit-Spur,
   Pipelines direkt andockbar; Alternative: internes GitHub Enterprise der ING).
   Lizenz ist MIT, d. h. Übernahme, Anpassung und interner Betrieb sind uneingeschränkt
   erlaubt.
2. **Azure-Ressourcen anlegen:** Function App (Linux, Node 20, Consumption- oder
   Flex-Plan), Storage Account (Tabelle `qualityGateKeyValueStore`), Key Vault,
   Azure-OpenAI-Ressource mit Modell-Deployment. System-assigned Managed Identity der
   Function App aktivieren und ihr die Rollen „Key Vault Secrets“ (get/set/delete) und
   „Cognitive Services OpenAI User“ geben.
3. **Backend konfigurieren und deployen:** App-Settings setzen
   (`AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PROJECT`, `LLM_PROVIDER=azure-openai`,
   `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_KEY_VAULT_URL`,
   `CORS_ALLOWED_ORIGIN`), dann `func azure functionapp publish <app-name>`.
4. **Extension bauen:** `VITE_API_BASE_URL` auf die Bank-Backend-URL setzen,
   `cd web && npm install && npm run package` → `.vsix`-Datei.
5. **Extension installieren:** Als Org-Owner unter *Organization Settings → Extensions →
   Upload extension* hochladen. Kein öffentlicher Marketplace-Eintrag nötig
   (`"public": false`).
6. **Verifizieren:** Work Item öffnen → Tab „QualityGate AI“ → Analyse laufen lassen;
   Admin-Gate und Berechtigungs-Bitmaske gegen die Ziel-Organisation prüfen (siehe
   Security-Befund M-5).

### 2.4 Benötigte Rechte

| Bereich | Recht | Wofür |
| --- | --- | --- |
| Azure | Contributor auf der Resource Group | Function App, Storage, Key Vault, OpenAI-Ressource anlegen |
| Azure | Rollenzuweisung „Cognitive Services OpenAI User“ an die Managed Identity | LLM-Aufrufe ohne API-Key |
| Azure | Key-Vault-Policy (get/set/delete Secrets) für die Managed Identity | Secret-Zugriff |
| Azure DevOps | Organization Owner bzw. „Manage extensions“ | .vsix hochladen/installieren |
| Azure DevOps | Endnutzer: normale Work-Item-Rechte | Extension nutzt das eigene Nutzer-Token (Scopes `vso.work`, `vso.work_write`, `vso.profile`) |
| Azure DevOps | Admin-Aktionen (Rulesets verwalten, Konfiguration): projektweite Schreibrechte bzw. Eintrag in `ADO_ADMIN_USER_IDS` | Admin-Gate |

Bewusst **nicht** nötig: ein Service-Account mit Vollzugriff auf Boards. Jeder Zugriff
auf Work Items geschieht mit dem Token des angemeldeten Nutzers – wer ein Work Item
nicht sehen darf, kann es auch über das Tool nicht sehen.

### 2.5 Datenschutz – wo werden die Daten verarbeitet?

| Datum | Wo verarbeitet | Gespeichert? |
| --- | --- | --- |
| Work-Item-Texte (Titel, Beschreibung, Akzeptanzkriterien) | Function App + Azure OpenAI, beides EU-Region im Bank-Tenant | Analyse-Ergebnisse in Azure Table Storage (Bank-Tenant) |
| Nutzeridentität | nur die Azure-DevOps-Nutzer-ID (GUID), aufgelöst über die ADO-API | als Schlüssel für Nutzereinstellungen/Verbrauchszähler |
| Zugriffstoken | nur im Speicher pro Request (Token-Passthrough), niemals persistiert | nein |
| OpenAI-Key (nur falls Public-OpenAI-Variante) | Azure Key Vault | ja, verschlüsselt im Vault |

Kernaussagen für die Bank:

- **Keine Daten in die USA:** Vorgesehen ist `LLM_PROVIDER=azure-openai` mit einem
  EU-Endpoint. Der alternative Public-OpenAI-Pfad existiert im Code als
  Entwickler-Fallback und wird für den Bankbetrieb schlicht nicht konfiguriert
  (empfohlen: organisatorisch untersagen, technisch per Egress-Firewall blocken).
- **Kein Modelltraining mit Bank-Daten:** Azure-OpenAI-Zusicherung von Microsoft;
  Prompts/Completions werden nicht an OpenAI (das Unternehmen) weitergegeben.
  Standardmäßig hält Microsoft Prompts bis zu 30 Tage für Missbrauchserkennung vor –
  dagegen kann die Bank „modified abuse monitoring“ (Opt-out) beantragen, üblich bei
  Finanzinstituten.
- **DSGVO-Einordnung:** Work-Item-Texte können Personenbezug enthalten (Namen in
  Stories). Verarbeitung bleibt innerhalb des bestehenden Microsoft-AVV der Bank.
  Empfehlung: das Tool in die Datenschutz-Folgenabschätzung des bestehenden
  Azure-DevOps-/Azure-OpenAI-Stacks aufnehmen; eine eigene DSFA ist wegen des geringen
  Datenumfangs voraussichtlich nicht nötig, entscheidet aber der DSB der Bank.
- **Mensch in der Schleife:** Die KI legt nie selbstständig etwas an oder ändert etwas.
  Generieren und Übernehmen sind getrennte Schritte, jede Übernahme erzeugt einen
  Audit-Eintrag. Für die EU-AI-Act-Einordnung ist das ein unterstützendes Werkzeug mit
  menschlicher Letztentscheidung (kein Hochrisiko-System).

### 2.6 Kosten (Größenordnung, Pilot mit ~1 Team / ~50 Nutzern)

| Posten | Monatlich (ca.) | Anmerkung |
| --- | --- | --- |
| Azure Functions (Consumption) | 0–10 € | Freikontingent deckt Pilotlast meist ab |
| Storage Account (Table) | < 2 € | Kilobyte-große Datensätze |
| Key Vault | < 1 € | wenige Operationen |
| Azure OpenAI (z. B. GPT-4o-mini) | 20–100 € | nutzungsabhängig; ~2–5k Token pro Analyse; eingebauter Verbrauchszähler pro Nutzer vorhanden |
| Application Insights | 5–25 € | empfohlen |
| **Summe Pilot** | **~30–140 €** | |
| Enterprise-Härtung (Private Endpoints, VNet, ggf. APIM/WAF) | +100–350 € | je nach Bank-Vorgaben |

Einmalig: 2–5 Personentage technisches Setup + Aufwand der Bank-Gremien. Die Kosten
skalieren fast ausschließlich mit der LLM-Nutzung; Budget-Alerts auf der
Azure-OpenAI-Ressource sind in 10 Minuten eingerichtet.

### 2.7 Zeitplan (realistisch, inkl. Bank-Prozesse)

| Phase | Dauer | Inhalt |
| --- | --- | --- |
| 1. Repo-Übernahme + interner Review | 1 Woche | Code in Bank-Repo, Dependency-/License-Scan, dieses Dokument als Input |
| 2. Genehmigungen | 2–4 Wochen (parallel) | Subscription, Azure-OpenAI-Freigabe, Security-/Compliance-Review, ggf. Betriebsrat |
| 3. Infrastruktur + Deployment | 2–5 Tage | Ressourcen, Backend, Extension-Build, Installation |
| 4. Härtung + Verifikation | 1 Woche | die 5 Punkte aus Abschnitt 4, Admin-Gate-Verifikation, Pen-Test-Slot falls gefordert |
| 5. Pilot mit einem Team | 2–4 Wochen | Feedback, Kostenbeobachtung |
| **Gesamt bis laufender Pilot** | **~6–10 Wochen** | Engpass: Genehmigungen, nicht Technik |

### 2.8 Quellcode-Ablage

Empfehlung: **Azure Repos in der Azure-DevOps-Organisation der ING.**

- Gleiche Zugriffs-/Berechtigungswelt wie Boards, keine neue Plattform.
- Build-Pipeline (Extension-`.vsix` + Function-Deploy) direkt in Azure Pipelines.
- Vollständige Audit-Historie, Branch-Policies, Pflicht-Reviews – bankkonform.
- Alternative, falls die ING GitHub Enterprise (intern) standardmäßig nutzt: dort –
  entscheidend ist nur „intern, zugriffskontrolliert, mit Review-Pflicht“, nicht das
  Produkt.
- Das heutige öffentliche GitHub-Repo bleibt davon unberührt (MIT-Lizenz); der
  Bank-Fork wird intern weitergepflegt.

---

## 3. Security-Befund (vollständiger Code-Durchlauf, 2026-07-08)

Geprüft: alle Backend-Schichten (`src/functions`, `auth`, `services`, `gateways`,
`repositories`, `providers/llm`, `utils`), Frontend (`web/src`, insbesondere
API-Shim und HTML-Rendering), Manifeste/Konfiguration, Abhängigkeiten (`npm audit`
Backend + Frontend), Secret-Scan über den gesamten Baum.

### 3.1 Gesamturteil

**Keine kritischen oder hohen Schwachstellen.** Die Architektur ist für ein
Bank-Deployment ungewöhnlich gut vorbereitet (Token-Passthrough statt Service-Account,
fail-closed Admin-Gate, Key Vault + Managed Identity, Sanitisierung an allen
HTML-Grenzen). Fünf mittlere/niedrige Punkte sind vor Produktivbetrieb zu härten.

### 3.2 Positive Feststellungen

| Bereich | Befund |
| --- | --- |
| Secrets | Kein hartkodiertes Secret im gesamten Baum (Scan ohne Treffer); `local.settings.json` ist nur als `.example` mit Platzhaltern im Repo |
| AuthN | Alle 32 fachlichen Endpunkte hinter `withAuth` (Bearer-Token-Pflicht, Identität wird serverseitig gegen die ADO-Org verifiziert); offen sind nur `/health` und der CORS-Preflight – unkritisch |
| AuthZ | Admin-Gate `assertAdmin` ist **fail-closed**: jeder Fehler (Netz, unerwartete Antwort, fehlender Kontext) führt zur Ablehnung, nie zur Erlaubnis |
| Rechte-Modell | Token-Passthrough: ADO-Zugriffe laufen mit dem Token des Nutzers → keine Privilegien-Ausweitung über das Tool möglich |
| XSS | LLM-Ausgabe wird im Frontend mit **DOMPurify** sanitisiert (`fix-flow.tsx`), Rückschreiben in Work Items serverseitig mit **sanitize-html** und enger Tag-Whitelist (`azure-devops-apply-service-core.js`, `test-case-service-core.js`) |
| Injection | WIQL-Suchbegriffe werden escaped, Work-Item-IDs strikt numerisch validiert (`isSafeWorkItemId`), Feld-Updates nur über eine Allowlist von drei Feldern |
| Secret-Handling | OpenAI-Key im Key Vault (Managed Identity); API-Key erscheint in Logs und API-Antworten nur maskiert (`sk-xxxxx...xxxx`); Azure-OpenAI-Pfad kommt komplett ohne API-Key aus |
| Dependencies Backend | `npm audit`: **0 Schwachstellen**; bewusst kleiner Fußabdruck (6 Runtime-Abhängigkeiten, alle von Microsoft/Azure bzw. etablierte Sanitizer) |
| KI-Kontrolle | Kein autonomes Schreiben: Generieren und Anlegen sind getrennte Nutzeraktionen; Apply-Aktionen erzeugen Audit-Einträge (`apply-audit:*`) |

### 3.3 Zu härtende Punkte vor Produktivbetrieb

| ID | Schwere | Befund | Ort | Empfehlung |
| --- | --- | --- | --- | --- |
| M-1 | Mittel | CORS-Default ist `Access-Control-Allow-Origin: *` | `src/utils/cors.js:1` | `CORS_ALLOWED_ORIGIN` in der Function App zwingend auf die Extension-Host-Domain setzen; da Auth per Bearer-Token (keine Cookies) läuft, ist das Risiko begrenzt – trotzdem Pflicht-Setting für die Bank |
| M-2 | Mittel | `allowInsecureConnection: true` im Table-Storage-Client erlaubt unverschlüsselte Verbindungen | `src/repositories/table-kv-store.js:45` | Nur für lokalen Azurite nötig → an `NODE_ENV`/Env-Flag koppeln, in Produktion HTTPS erzwingen (zusätzlich „Secure transfer required“ am Storage Account) |
| M-3 | Mittel | LLM-Prompts/-Antworten (also Work-Item-Inhalte) landen als Vorschau in den Logs | `src/providers/llm/azure-openai-provider.js:138–147, 203–211` (analog OpenAI-Provider) | Für die Bank Prompt-/Output-Previews per Flag abschaltbar machen oder auf Metadaten (Token-Zahlen, IDs) reduzieren; Log-Retention in App Insights mit dem DSB abstimmen |
| M-4 | Mittel | Frontend-Default-Backend-URL zeigt auf die Instanz des Autors (`qualitygate-ai-api.azurewebsites.net`) – bei vergessenem `VITE_API_BASE_URL` gingen Bank-Daten an ein fremdes Backend | `web/src/api/invoke.ts:25` | Default entfernen bzw. Build ohne gesetzte Variable fehlschlagen lassen; Bank-Pipeline setzt die URL fest |
| M-5 | Mittel | Admin-Bitmaske (Default `GENERIC_WRITE`) und Security-Namespace sind org-abhängig und noch nicht gegen die Ziel-Org verifiziert (im README selbst als offen markiert); Allowlist `ADO_ADMIN_USER_IDS` umgeht den Permission-Check | `src/auth/require-admin.js` | Vor Go-Live gegen die ING-Organisation verifizieren (`GET _apis/securitynamespaces`), Allowlist leer lassen oder auf dokumentierte Admin-GUIDs beschränken |
| L-1 | Niedrig | Interne Fehlermeldungen (inkl. ADO-Antwort-Fragmente) werden 1:1 an den Client durchgereicht | `src/utils/http-responses.js:26–40` | In Produktion generische Meldung + Korrelations-ID zurückgeben, Details nur ins Log |
| L-2 | Niedrig | `npm audit` Frontend: esbuild/vite-Advisory (GHSA-67mh-4wv8-2f99) – betrifft **nur den Dev-Server**, nicht das ausgelieferte Bundle | `web/package.json` | Bei Gelegenheit Vite-Major-Update; kein Produktionsrisiko |
| L-3 | Niedrig | PAT-Fallback (`AZURE_DEVOPS_PAT`) als Umgebungsvariable vorgesehen (lokaler Dev-Pfad; in Produktion greift immer das Nutzer-Token, da alle Endpunkte Auth erzwingen) | `src/gateways/azure-devops/work-item-gateway.js:69` | In der Bank-Function-App schlicht nicht setzen; optional Code-Guard, der den PAT-Pfad außerhalb `NODE_ENV=development` verweigert |
| L-4 | Niedrig | Keine Rate-Limits auf den LLM-Endpunkten → ein authentifizierter Nutzer könnte Kosten treiben | `src/functions/fix-suggestions.js`, `test-cases.js` | Verbrauchszähler existiert bereits (`ai-usage-service`); um ein hartes Limit/Quota ergänzen + Azure-Budget-Alert |

### 3.4 Für den Bank-Security-Review relevante Eigenschaften

- Angriffsfläche: eine HTTPS-API (Function App) + statisches Extension-Bundle; keine
  offenen Admin-Oberflächen, keine Datenbank mit eigenem Endpoint.
- Authentifizierung delegiert vollständig an Azure DevOps (Entra ID der Bank inklusive
  deren MFA/Conditional-Access-Policies).
- Reproduzierbarer Build (`package-lock.json` eingecheckt), MIT-Lizenz, SBOM per
  `npm ls`/Standard-Tooling erzeugbar.

---

## 4. Erwartbare Gegenfragen der ING – mit Antworten

1. **„Verlassen Daten die EU oder unseren Tenant?“** – Nein. Function App, Storage,
   Key Vault und Azure OpenAI laufen in einer EU-Region im Tenant der Bank. Der einzige
   externe Pfad (Public OpenAI) ist ein Dev-Fallback, der nicht konfiguriert und per
   Egress-Regel blockierbar ist.
2. **„Trainiert Microsoft/OpenAI mit unseren Daten?“** – Nein, vertraglich
   ausgeschlossen (Azure-OpenAI-Datenverarbeitungszusagen). Optional „modified abuse
   monitoring“ beantragen, dann entfällt auch die bis zu 30-tägige
   Missbrauchs-Vorhaltung.
3. **„Welche Daten genau gehen an das LLM?“** – Nur Titel, Beschreibung und
   Akzeptanzkriterien des gerade geöffneten Work Items plus das Regelwerk. Keine
   Anhänge, keine Kommentare, keine Personaldaten aus anderen Systemen.
4. **„Kann das Tool mehr als der Nutzer selbst?“** – Nein. Es verwendet das
   Zugriffstoken des angemeldeten Nutzers (Token-Passthrough). Berechtigungen der Bank
   in Azure DevOps gelten 1:1 weiter.
5. **„Was passiert, wenn die KI Unsinn erzeugt?“** – Nichts wird automatisch
   geschrieben. Jeder Vorschlag ist eine Vorschau, die der Nutzer editieren, verwerfen
   oder übernehmen kann; Übernahmen werden auditiert.
6. **„Wie ist der Code abgesichert / wurde er geprüft?“** – Vollständiger Code-Review
   liegt vor (Abschnitt 3): keine kritischen Findings, Backend-Dependencies ohne
   bekannte Schwachstellen, definierte Härtungsliste vor Go-Live. Ein Pen-Test durch
   die Bank ist problemlos möglich (eine API, klar umrissen).
7. **„EU AI Act?“** – Unterstützendes Qualitätswerkzeug mit menschlicher
   Letztentscheidung, kein Hochrisiko-Anwendungsfall (keine Entscheidungen über
   Personen). Einordnung dokumentieren wir im Rahmen der AI-Governance der Bank.
8. **„Wie kontrollieren wir die Kosten?“** – Eingebauter Token-Verbrauchszähler pro
   Nutzer, dazu Azure-Budget-Alerts auf der OpenAI-Ressource; Kosten skalieren nur mit
   Nutzung (Abschnitt 2.6).
9. **„Was ist der Exit?“** – `LLM_PROVIDER=disabled` schaltet die KI ab, die Extension
   lässt sich per Klick deinstallieren, Daten liegen ausschließlich in Bank-Ressourcen
   und werden mit diesen gelöscht. Kein Vendor-Lock-in über Azure hinaus.
10. **„Betrieb und Support?“** – Serverless (Function App), kein Patching von VMs;
    Monitoring über Application Insights; Quellcode liegt intern, MIT-lizenziert, d. h.
    die Bank kann selbst weiterentwickeln.
11. **„Geht das auch mit Azure DevOps Server (on-prem)?“** – Aktuell ist die Extension
    auf dev.azure.com (Cloud) ausgelegt; eine On-Prem-Variante wäre ein eigenes
    Vorhaben.
12. **„Wer haftet?“** – Software wird „as is“ (MIT) übernommen und läuft als interne
    Anwendung der Bank; die üblichen internen Freigabeprozesse für selbstbetriebene
    Tools greifen.

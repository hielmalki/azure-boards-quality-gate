# Testfälle mit KI erstellen (in einfacher Sprache erklärt)

Diese Anleitung erklärt, wie das Quality Gate aus einer User Story automatisch
Testfälle vorschlägt und als Test Cases in Azure Boards anlegt. Kein Copy-Paste nach
Copilot mehr — alles passiert direkt im Work Item. Die technische Architektur steht in
[`azure-boards-migration-architektur.md`](./azure-boards-migration-architektur.md).

---

## Das Problem, das wir lösen

Bisher lief das so: Story-Text nach Copilot kopieren, Antwort zurückkopieren, von Hand
als Test Case anlegen. Drei Werkzeuge, viel Kopieren, leicht etwas vergessen.

> **Kurz gesagt:** Der Kontext (die Story mit ihren Akzeptanzkriterien) ist im Work
> Item schon da. Warum ihn erst herauskopieren? Wir lassen die KI **im Ticket**
> arbeiten und schreiben das Ergebnis **ins Ticket** zurück.

---

## Was ein „Testfall" hier ist

Ein Testfall beschreibt, **was** getestet wird und **was dabei herauskommen soll** —
noch kein Programmcode, sondern die nachvollziehbare Prüfanweisung. In Azure Boards ist
das ein eigener Work-Item-Typ: **Test Case**.

| Teil eines Testfalls | Bedeutung | Beispiel |
| --- | --- | --- |
| Titel | worum geht es | „Login mit gültigen Zugangsdaten" |
| Vorbedingung | was vorher stimmen muss | „Benutzer ist registriert und nicht gesperrt" |
| Schritte | was man tut → was erwartet wird | „Gültige Daten eingeben, Absenden" → „Dashboard erscheint" |
| Priorität | wie wichtig (1–4) | 2 |
| Abgeleitet aus | welches Akzeptanzkriterium | „AK-2" |

> **Faustregel:** Ein guter Testfall ist so konkret, dass zwei Menschen ihn gleich
> ausführen und zum gleichen Ergebnis kommen.

---

## So entstehen die Testfälle — Schritt für Schritt

### 1. Du öffnest eine User Story
Im Work-Item-Formular erscheint das Quality Gate. Ein neuer Abschnitt **„Testfälle"**
ist sichtbar.

### 2. Du klickst „Testfälle generieren"
Das Tool liest die **Beschreibung** und die **Akzeptanzkriterien** der Story. Diese
Felder liegen bereits als lesbarer Text vor (das Tool wandelt HTML automatisch um).

### 3. Die KI leitet Testfälle ab
Der Text geht an das KI-Modell mit einer klaren Anweisung:

> **Wichtig:** „Nutze **nur** den Text der Story. Erfinde nichts dazu. Decke auch
> Negativ- und Randfälle ab, wenn die Akzeptanzkriterien sie nahelegen."

Die KI antwortet **nicht** als Fließtext, sondern in einer festen, geprüften Struktur
(Titel, Vorbedingung, Schritte, Priorität, Herkunft). So können wir die Testfälle
zuverlässig weiterverarbeiten.

### 4. Du prüfst und korrigierst die Vorschläge
Die Testfälle erscheinen als **Vorschau-Liste** im Panel. Du kannst jeden Eintrag
**bearbeiten**, bevor irgendetwas gespeichert wird.

> ✅ **Du behältst die Kontrolle:** Die KI legt **nie** von allein etwas an.
> Generieren und Anlegen sind zwei getrennte Schritte.

### 5. Du entscheidest, was mit den Testfällen passiert
Drei Wege, einzeln oder kombiniert:

| Weg | Was passiert |
| --- | --- |
| **Als Test Case anlegen** | Für jeden gewählten Testfall entsteht ein **eigenes Test-Case-Work-Item** in Azure Boards. Die Schritte landen im richtigen Feld, und der Test Case wird automatisch mit der Story **verlinkt** („Tested By"). |
| **Kopieren / Herunterladen** | Die Testfälle als Text kopieren oder als Datei speichern — falls du sie woanders brauchst. |
| **An die Story anhängen** | Die Testfälle als Abschnitt unten an die Story-Beschreibung schreiben. |

---

## Was „verlinkt" bedeutet — und warum das wichtig ist

Wird ein Test Case angelegt, verbindet ihn das Tool mit der Story über die Beziehung
**„Tested By"**. Zusätzlich merkt sich jeder Testfall, aus **welchem
Akzeptanzkriterium** er stammt.

> **Warum das zählt (gerade in einer Bank):** So ist jederzeit nachweisbar, welche
> Anforderung durch welchen Testfall abgedeckt ist — eine lückenlose Spur von der Story
> bis zum Test. Genau das wollen Audits sehen.

---

## Wohin gehen die Daten? (Datenschutz)

Der Story-Text wird zur Testfall-Erzeugung an ein KI-Modell geschickt. Damit
Bank-Daten **nicht** in die USA abfließen, nutzen wir **Azure OpenAI in der
EU-Region** im selben Azure-Tenant. Die Anmeldung läuft über die **Managed Identity**
der Function App — es liegt kein Schlüssel im Klartext herum.

| Einstellung | Bedeutung |
| --- | --- |
| `LLM_PROVIDER=azure-openai` | schaltet auf den EU-Provider um |
| `AZURE_OPENAI_ENDPOINT` | die Adresse deiner Azure-OpenAI-Ressource (EU) |
| `AZURE_OPENAI_DEPLOYMENT` | der Modell-Name (Deployment) |

> **Merke:** Ohne diese Variablen läuft das Tool auf dem bisherigen OpenAI-Weg. Für den
> Bank-Betrieb ist der Azure-OpenAI-EU-Weg vorgesehen.

---

## Häufige Fragen

**Erzeugt das Tool fertigen Test-*Code*?**
Nein. Es erzeugt **Testfälle** (Prüfanweisungen) als Azure-Test-Case-Work-Items — nicht
den Programmcode der Unit-Tests. Der Testfall beschreibt, *was* geprüft wird; das
Umsetzen in Code bleibt beim Entwickler.

**Kann die KI etwas erfinden?**
Sie ist ausdrücklich angewiesen, nur den Story-Text zu verwenden. Trotzdem gilt:
**Du prüfst** die Vorschläge vor dem Anlegen.

**Was, wenn die Story kaum Akzeptanzkriterien hat?**
Dann werden die Vorschläge dünn. Faustregel: bessere Akzeptanzkriterien → bessere
Testfälle. Das Quality Gate hilft dir separat, die AK zu verbessern.

---

> **Nächster konkreter Schritt:** Öffne eine User Story mit ein paar
> Akzeptanzkriterien, klick „Testfälle generieren" und schau dir die Vorschau an —
> anlegen musst du erst, wenn sie dir gefallen.

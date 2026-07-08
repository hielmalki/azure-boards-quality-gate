# QualityGate AI – Lösungsüberblick für die ING Bank

Kundentauglicher Lösungs- und Vorgehensüberblick für Fachbereich, Testmanagement und
IT-Security. Aufbau: Problem → Lösung → Nutzen → Betrieb → Datenschutz → Vorgehen →
Aufwand → Security → Beratungsbeitrag → erwartbare Fragen.

> **Status der Lösung:** lauffähiger Prototyp, im Azure-Tenant der Bank betreibbar.
> Verkauft wird die Beratungsleistung (Einführung, Absicherung, Anpassung), nicht ein
> fertiges IT-Produkt.

Eine formatierte Fassung für die Präsentation liegt als Word-Datei bei:
[`QualityGate-AI-ING-Vorstellung.docx`](./QualityGate-AI-ING-Vorstellung.docx).

---

## 1. Ausgangslage: Warum Anforderungs- und Testfallqualität heute Zeit kostet

User Stories werden häufig mit unklaren oder unvollständigen Anforderungen angelegt:
Akzeptanzkriterien fehlen, Beschreibungen sind mehrdeutig, ähnliche Anforderungen werden
doppelt erfasst. Zu jeder Story müssen zudem passende Testfälle erstellt werden.

In der Praxis läuft das oft über einen Umweg: Der Story-Text wird in ein separates
KI-Werkzeug kopiert, das Ergebnis zurückkopiert und der Testfall anschließend von Hand
angelegt. Das kostet Zeit, ist fehleranfällig und der Bruch zwischen mehreren Werkzeugen
führt dazu, dass Qualitätslücken erst spät auffallen – im Review, in der Entwicklung oder
im Test, wo ihre Behebung deutlich teurer ist als beim Anlegen der Anforderung.

## 2. Die Lösung: Qualitätsprüfung direkt im Work Item

QualityGate AI setzt genau dort an – als Erweiterung (Extension) direkt im
Work-Item-Formular von Azure Boards. Kein separates Werkzeug, kein Kontextwechsel: Die
Prüfung findet dort statt, wo die Anforderung ohnehin entsteht. Die Lösung liegt als
lauffähiger Prototyp vor und lässt sich im Azure-Tenant der Bank betreiben.

| Funktion | Was passiert | Ergebnis |
| --- | --- | --- |
| Qualitätsanalyse | Prüft Beschreibung und Akzeptanzkriterien KI-gestützt gegen ein konfigurierbares Regelset. | Qualitäts-Score und konkrete Befunde |
| Verbesserungsvorschläge | Formuliert je Befund einen konkreten Vorschlag; der Nutzer prüft und übernimmt. | Klarere Anforderung |
| Duplikaterkennung | Findet ähnliche Work Items im Projekt. | Weniger doppelt erfasste Anforderungen |
| Testfall-Generierung | Leitet Testfälle aus den Akzeptanzkriterien ab und legt sie als Test-Case-Work-Items an, verknüpft über „Tested By“. | Nachvollziehbare Testabdeckung |

## 3. Der Nutzen für die ING

**Weniger manuelle Nacharbeit pro User Story.** Testfälle entstehen in wenigen Minuten
Prüf- und Freigabeaufwand statt in manueller Nacharbeit. Erfahrungsgemäß fallen für das
manuelle Erstellen und Verknüpfen von Testfällen je Story rund 15–30 Minuten an; mit
QualityGate AI reduziert sich das auf wenige Minuten. Bei einem Team mit z. B. 20–40
Stories pro Sprint summiert sich das zu mehreren eingesparten Stunden je Sprint
(Richtwerte – die konkrete Ersparnis messen wir im Pilot).

**Kein Werkzeugwechsel – eine Extension für das Testmanagement.** Analyse, Vorschläge und
Testfall-Generierung laufen vollständig im Work-Item-Formular. Das Testmanagement bleibt
in Azure Boards; das Kopieren zwischen mehreren Werkzeugen entfällt.

**Datenschutzkomfort ab Werk.** Der Betrieb ist so ausgelegt, dass Inhalte den
Azure-Tenant und die EU-Region nicht verlassen und keine Zugangsschlüssel im Klartext in
der Anwendung liegen (Details in Abschnitt 5).

**Nachvollziehbarkeit von der Anforderung bis zum Testfall.** Jeder generierte Testfall
wird über „Tested By“ mit der Anforderung verknüpft und merkt sich, aus welchem
Akzeptanzkriterium er stammt. So ist durchgängig nachvollziehbar, welche Anforderung
durch welchen Testfall abgedeckt ist.

**Der Mensch entscheidet.** Die KI erstellt Vorschläge, legt aber nie selbstständig etwas
an. Generieren und Übernehmen sind getrennte Schritte; jede Übernahme wird protokolliert.

## 4. Betrieb im eigenen Azure-Tenant der Bank

Der Betrieb erfolgt vollständig im Azure-Tenant der ING – kein externer SaaS-Dienst, kein
Fremd-Betreiber. Im Kern werden drei Azure-Ressourcen benötigt:

| Ressource | Aufgabe |
| --- | --- |
| **Azure Function App** | Das Backend. Hier läuft die Anwendungslogik. Anfragen aus der Extension (z. B. „Work Item analysieren“) werden von der Function App verarbeitet. |
| **Storage Account** | Ablage für Ergebnisse und Zustand (Analysen, Regelsets, Protokolle). Zugleich Pflichtkomponente jeder Azure Function App. |
| **Azure OpenAI (EU-Region)** | Das KI-Modell für Analyse und Textgenerierung – innerhalb der EU-Region, ohne dass Bankdaten die EU verlassen. |

> **Hinweis Key Vault (optional):** Im vorgesehenen Betrieb mit Managed Identity werden
> keine Zugangsschlüssel gespeichert – der Key Vault bliebe faktisch leer. Er ist daher
> keine Pflicht-Ressource, sondern ein optionaler Best-Practice-Baustein für den Fall,
> dass künftig doch Secrets abzulegen sind.

Ergänzend wird die Extension in der Azure-DevOps-Organisation der Bank installiert. Der
Quellcode wird in ein internes Repository der Bank übernommen – idealerweise in Azure
Repos derselben Azure-DevOps-Organisation, mit gleicher Zugriffskontrolle und
Review-Pflicht.

## 5. Datenschutz und Datenverarbeitung

Verarbeitet werden ausschließlich Work-Item-Inhalte, insbesondere Titel, Beschreibung und
Akzeptanzkriterien der jeweils geöffneten Anforderung. Keine Anhänge, keine Kommentare,
keine Daten aus anderen Systemen.

Für den Bankbetrieb ist Azure OpenAI in einer EU-Region (z. B. Germany West Central /
Frankfurt, abhängig von der Modellverfügbarkeit) innerhalb des Bank-Tenants vorgesehen.
Die Daten verlassen damit weder Azure noch die EU und werden – vertraglich durch
Microsoft zugesichert – nicht zum Training von Modellen verwendet.

> **Offener Punkt zur Klärung mit der Bank:** Werden Work-Item-Inhalte bereits heute in
> der Azure Cloud verarbeitet oder ausschließlich on-premises? Werden sie ohnehin in
> Azure verarbeitet, ist die Verarbeitung durch Azure OpenAI in der EU-Region konsistent
> mit dem bestehenden Vorgehen und aus Datenschutzsicht unkritisch.

**Authentifizierung.** Jeder Zugriff auf Azure Boards erfolgt mit dem persönlichen
Azure-DevOps-Token des angemeldeten Nutzers (Token-Passthrough); das Token wird nicht
gespeichert. Der Zugriff der Function App auf Azure OpenAI läuft über Managed Identity,
also ohne API-Schlüssel. Im vorgesehenen Betrieb liegen damit keine Zugangsschlüssel im
Klartext in der Anwendung – und faktisch auch keine im Key Vault.

## 6. Vorgehen für einen Pilotbetrieb

Da die Lösung als Prototyp bereits vorliegt, konzentriert sich der Pilot auf
Bereitstellung, Absicherung und Bewertung im Umfeld der Bank:

1. **Resource Group** bei der ING bereitstellen.
2. **Interne Freigabe** für Azure OpenAI einholen.
3. **Azure-Ressourcen** anlegen und die Anwendung deployen (Function App, Storage,
   Azure OpenAI).
4. **Extension** in der Azure-DevOps-Organisation der Bank installieren und mit dem
   Bank-Backend verbinden.
5. **Pilot** mit einem Team starten – inklusive Messung der tatsächlichen Zeitersparnis
   und Qualitätswirkung.

## 7. Zeitrahmen und Investition

Technisch ist die Bereitstellung eine Sache weniger Tage. Realistisch bestimmen die
bankinternen Freigabeprozesse (Subscription, Azure-OpenAI-Freigabe, Security- und
Datenschutzprüfung) den Zeitrahmen – bis zum laufenden Pilot sind das erfahrungsgemäß
rund **6–10 Wochen**. Der Engpass sind die Genehmigungen, nicht die Technik.

Die laufenden Infrastrukturkosten sind bewusst schlank: für einen Pilot mit einem Team
im niedrigen zweistelligen bis unteren dreistelligen Eurobereich pro Monat, überwiegend
nutzungsabhängige Kosten für die KI-Aufrufe. Ein eingebauter Verbrauchszähler und
Azure-Budget-Alerts halten die Kosten transparent und begrenzt.

## 8. Security-Assessment

Der Quellcode wurde vollständig geprüft. Ergebnis: **keine kritischen oder hohen
Schwachstellen**. Positiv fallen insbesondere auf: keine fest im Code hinterlegten
Zugangsdaten, durchgängige Authentifizierung aller fachlichen Schnittstellen, ein
fail-closed abgesichertes Rechte-Gate, Bereinigung aller KI-Ausgaben vor Anzeige und
Rückschreiben sowie eine Abhängigkeitsprüfung des Backends ohne Befund.

Vor dem Produktivbetrieb setzen wir – gemeinsam mit dem Security-Team der Bank – eine
überschaubare Zahl an Härtungsmaßnahmen um:

- **Zugriffsbeschränkung:** den Zugriff auf die API auf die Domäne der Extension
  beschränken.
- **Transportverschlüsselung:** verschlüsselten Transport für alle Speicherzugriffe
  erzwingen.
- **Protokollierung:** Protokollierung von Inhalten reduzieren und die Aufbewahrung mit
  dem Datenschutz abstimmen.
- **Backend-Bindung:** die Backend-Adresse im Build fest auf das Bank-Backend setzen.
- **Rechteprüfung:** die Berechtigungsprüfung gegen die konkrete
  Azure-DevOps-Organisation der Bank verifizieren.

Alle Punkte sind bekannt, klein und ohne Architekturänderung umsetzbar. Ein eigener
Penetrationstest durch die Bank ist jederzeit möglich – die Angriffsfläche ist klar
umrissen (eine abgesicherte Schnittstelle plus statische Extension).

## 9. Unser Beitrag als Beratung

Im Zentrum steht nicht der Verkauf eines fertigen Produkts, sondern die Begleitung der
Einführung eines Quality Gates für Anforderungen und Testfälle. Der vorliegende Prototyp
belegt, dass der Ansatz funktioniert, und beschleunigt die Umsetzung. Wir bringen ein:

- **Fachliche Begleitung:** Analyse der bestehenden Anforderungs- und Testprozesse,
  Zuschnitt der Regelsets auf die Vorgaben der ING.
- **Technische Umsetzung:** Bereitstellung und Absicherung im Azure-Tenant der Bank,
  Härtung vor Go-Live, Übergabe in ein internes Repository.
- **Governance:** Zusammenarbeit mit Security und Datenschutz, transparente Bewertung von
  Risiken und Maßnahmen.
- **Nachweis:** messbarer Pilot mit einem Team, Bewertung von Zeitersparnis und
  Qualitätswirkung als Grundlage für die Entscheidung über eine breitere Einführung.

## 10. Erwartbare Fragen der ING – mit Antworten

1. **Verlassen Daten die EU oder unseren Tenant?** – Nein. Function App, Storage und
   Azure OpenAI laufen in einer EU-Region im Tenant der Bank. Ein externer
   Verarbeitungsweg ist nicht vorgesehen und lässt sich technisch unterbinden.
2. **Trainiert Microsoft oder OpenAI mit unseren Daten?** – Nein, vertraglich
   ausgeschlossen. Optional lässt sich zusätzlich die kurzzeitige Vorhaltung zur
   Missbrauchserkennung abbestellen – bei Finanzinstituten üblich.
3. **Welche Daten gehen an das KI-Modell?** – Nur Titel, Beschreibung und
   Akzeptanzkriterien der geöffneten Anforderung sowie das Regelwerk. Keine Anhänge,
   keine Kommentare, keine Daten aus anderen Systemen.
4. **Kann das Tool mehr als der jeweilige Nutzer selbst?** – Nein. Jeder Zugriff erfolgt
   mit dem Token des angemeldeten Nutzers. Die Berechtigungen der Bank in Azure DevOps
   gelten unverändert weiter.
5. **Was passiert bei einem fehlerhaften KI-Vorschlag?** – Nichts wird automatisch
   übernommen. Jeder Vorschlag ist eine Vorschau, die der Nutzer prüfen, ändern,
   verwerfen oder übernehmen kann; Übernahmen werden protokolliert.
6. **Ist der Code sicherheitsgeprüft?** – Ja. Ein vollständiges Security-Assessment liegt
   vor (Abschnitt 8): keine kritischen Befunde, Backend-Abhängigkeiten ohne bekannte
   Schwachstellen, definierte Härtungsmaßnahmen vor Go-Live.
7. **Wie ordnet sich das im Rahmen des EU AI Act ein?** – Als unterstützendes
   Qualitätswerkzeug mit menschlicher Letztentscheidung – es trifft keine Entscheidungen
   über Personen und ist damit kein Hochrisiko-Anwendungsfall.
8. **Wie werden die Kosten kontrolliert?** – Über einen eingebauten Verbrauchszähler je
   Nutzer und Azure-Budget-Alerts. Die Kosten skalieren nur mit der tatsächlichen Nutzung.
9. **Wie sieht ein Ausstieg aus?** – Die KI lässt sich abschalten, die Extension
   deinstallieren. Alle Daten liegen ausschließlich in Bank-Ressourcen und werden mit
   diesen entfernt. Kein Vendor-Lock-in über Azure hinaus.
10. **Funktioniert das auch mit Azure DevOps Server (on-premises)?** – Die Lösung ist
    aktuell auf Azure DevOps in der Cloud ausgelegt. Eine On-Premises-Variante wäre ein
    eigenes Vorhaben.

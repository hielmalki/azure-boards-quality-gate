# Projekt-Anweisungen: azure-boards-quality-gate

## Commits bei größeren Tasks: atomar statt gesammelt

Bei einem Task, der mehrere unabhängige Teilschritte umfasst (z.B. Backend-Schema +
Mapping + Frontend + Tests), erstelle **pro abgeschlossenem, in sich sinnvollem
Teilschritt einen eigenen Commit**, statt alle Änderungen am Ende in einem einzigen
Commit zu bündeln.

- Ein Teilschritt ist "sinnvoll", wenn er für sich allein nachvollziehbar ist und den
  Build/die Tests nicht bewusst kaputt zurücklässt.
- Grund: bessere Nachvollziehbarkeit im Log, einfachere Reviews, gezieltes Revert
  einzelner Schritte ohne den ganzen Task zurückzurollen.
- Gilt nur, wenn der Nutzer ohnehin einen Commit angefordert hat (siehe globale Regel:
  nie ohne explizite Aufforderung committen). Es geht um die Aufteilung *bereits
  angeforderter* Commits, nicht um zusätzliche, ungefragte Commits.
- Weiterhin: **niemals Commits erzeugen, nur um die Commit- oder Contribution-Anzahl
  künstlich zu erhöhen.** Jeder Commit muss einen eigenständigen, inhaltlich
  abgeschlossenen Schritt darstellen.

**ForwardEmail Alias Manager**

Verwalten Sie Ihre **Forward Email**-Aliasse direkt in Thunderbird.

**Ein Forward Email-Konto und ein API-Token sind erforderlich.** Diese Erweiterung arbeitet mit dem Dienst [Forward Email](https://forwardemail.net). Sie erstellt kein Konto, keine Domain und keine Aliasse für Sie.

**Funktionen**

ForwardEmail Alias Manager verbindet Thunderbird mit Ihrem Forward Email-Konto. Dadurch können Sie die Aliasse Ihrer Forward Email-Domains verwalten, ohne Ihr E-Mail-Programm zu verlassen. Die Erweiterung bietet:

- Eine kompakte Aliasverwaltung in der Thunderbird-Symbolleiste
- Erstellen, Suchen, Bearbeiten, Aktivieren, Deaktivieren und Löschen von Aliassen sowie das Erzeugen von Passwörtern
- Alias-Einstellungen für Empfänger, Beschreibungen, Schlagwörter, IMAP-Speicher, PGP-Verschlüsselung, Empfängerüberprüfung, Abwesenheitsnachrichten und Filter
- Eine **Alias-Prüfung** beim Lesen einer Nachricht, die zu den Empfängeradressen der Nachricht passende Forward Email-Aliasse anzeigt

**Voraussetzungen**

Sie benötigen:

1. Ein Forward Email-Konto unter [forwardemail.net](https://forwardemail.net)
2. Mindestens eine in diesem Konto verfügbare Domain
3. Ein Forward Email-API-Token

**API-Token erstellen**

1. Melden Sie sich bei Ihrem Forward Email-Konto an.
2. Öffnen Sie [forwardemail.net/my-account/security](https://forwardemail.net/my-account/security).
3. Scrollen Sie zum Abschnitt **API Tokens**.
4. Wählen Sie **Generate**, um ein Token zu erstellen, und kopieren Sie es.
5. Bewahren Sie das Token sicher auf. Es berechtigt diese Erweiterung, Ihre Forward Email-Aliasse zu verwalten.

**Ersteinrichtung**

1. Öffnen Sie in Thunderbird die Seite **Einstellungen** der Erweiterung. Dafür gibt es zwei Möglichkeiten:
   - Klicken Sie in der Thunderbird-Symbolleiste auf **ForwardEmail Alias Manager** und anschließend im eingeblendeten Fenster auf das Zahnradsymbol. Falls noch kein Token eingerichtet ist, wählen Sie stattdessen **Einstellungen öffnen**.
   - Öffnen Sie die Add-ons-Verwaltung von Thunderbird, wählen Sie die Erweiterung **ForwardEmail Alias Manager** aus und öffnen Sie deren **Einstellungen**.
2. Fügen Sie das Forward Email-API-Token in das Feld **API-Token** ein.
3. Wählen Sie **Verbindung testen**, um das Token und die Verbindung zum Konto zu prüfen.
4. Wählen Sie **Speichern**.

Auf der Einstellungsseite können Sie das gespeicherte Token später ersetzen. Dort gibt es außerdem einen Demo-Modus mit Beispieldaten. Deaktivieren Sie ihn, um Ihre echten Forward Email-Aliasse zu verwalten.

**Aliasse über die Thunderbird-Symbolleiste verwalten**

Klicken Sie in der Hauptsymbolleiste von Thunderbird auf **ForwardEmail Alias Manager**, um die Aliasverwaltung zu öffnen.

1. Wählen Sie oben im Domain-Auswahlfeld eine Ihrer Forward Email-Domains aus.
2. Durchsuchen Sie die angezeigten Aliasse über das Feld **Aliasse durchsuchen**.
3. Klicken Sie auf **Neuer Alias**, um einen Alias zu erstellen. Geben Sie den Namen ein, wählen Sie eine Domain aus und tragen Sie pro Zeile einen Empfänger ein. Optional können Sie eine Beschreibung, durch Kommas getrennte Schlagwörter oder IMAP-Speicher hinzufügen. Verwenden Sie einen Stern als Namen für einen Catch-all-Alias oder einen von Schrägstrichen umschlossenen Ausdruck als regulären Ausdruck.
4. Klicken Sie auf einen Alias, um seine Details zu öffnen. Dort können Sie Status, Empfänger, Beschreibung, Schlagwörter, IMAP-Speicher, PGP-Verschlüsselung, Empfängerüberprüfung und Abwesenheitsnachricht bearbeiten und anschließend **Änderungen speichern** wählen.
5. Für einen vorhandenen Alias können Sie außerdem ein Passwort erzeugen und kopieren, Filter verwalten oder den Alias nach einer Bestätigung löschen.

In der Liste können Alias-Typen, bei denen Forward Email dies unterstützt, außerdem direkt aktiviert oder deaktiviert werden.

**Aliasse beim Lesen einer Nachricht prüfen**

Wenn Sie eine E-Mail in einem Thunderbird-Nachrichten-Tab oder Nachrichtenfenster anzeigen, klicken Sie in der Nachrichten-Symbolleiste auf **ForwardEmail Alias Manager**, um die **Alias-Prüfung** zu öffnen.

Die Alias-Prüfung untersucht die Empfängerfelder der aktuell angezeigten Nachricht (An, Kopie und Blindkopie) und zeigt passende Forward Email-Aliasse an. Für jeden Treffer werden die passende Adresse, der Alias-Typ, die Domain und die eingerichteten Empfänger beziehungsweise der IMAP-Speicher angezeigt. Je nach Alias stehen folgende Aktionen zur Verfügung:

- Einen direkten Alias sperren oder entsperren
- Bei einem Catch-all-Alias oder regulären Ausdruck entweder die konkrete Empfängeradresse sperren oder den gesamten Alias sperren beziehungsweise entsperren
- Den gefundenen Alias in einem Bearbeitungsfenster mit allen Einstellungen öffnen

Wenn die angezeigte Nachricht zu keinem Forward Email-Alias passt, meldet die Alias-Prüfung eindeutig, dass kein Treffer gefunden wurde.

**Hinweise**

- Die Erweiterung verwaltet ausschließlich Daten des Forward Email-Kontos, das zum gespeicherten API-Token gehört.
- Änderungen in der Erweiterung werden an den Forward Email-Dienst übertragen und wirken sich auf die ausgewählte Domain beziehungsweise den ausgewählten Alias aus.
- Um ein anderes Forward Email-Konto oder Token zu verwenden, öffnen Sie erneut die Einstellungen der Erweiterung und speichern Sie das neue API-Token.

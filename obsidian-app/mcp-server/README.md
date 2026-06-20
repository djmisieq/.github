# Serwer MCP — notatki dla AI

Ten serwer udostępnia Twój skarbiec notatek (folder z plikami `.md`) asystentom
AI przez protokół **MCP (Model Context Protocol)**. Dzięki temu np. Claude może
przeglądać, wyszukiwać, tworzyć i edytować Twoje notatki.

## Narzędzia (tools)

| Narzędzie        | Opis                                                          |
|------------------|--------------------------------------------------------------|
| `list_notes`     | Lista wszystkich notatek                                     |
| `read_note`      | Treść wskazanej notatki                                      |
| `write_note`     | Utworzenie/nadpisanie notatki                               |
| `delete_note`    | Usunięcie notatki                                           |
| `search_notes`   | Wyszukiwanie frazy w nazwach i treści                       |
| `get_backlinks`  | Notatki linkujące `[[...]]` do podanej                      |
| `get_graph`      | Graf powiązań (węzły + krawędzie) w formacie JSON           |

## Instalacja

```bash
cd mcp-server
npm install
```

## Uruchomienie ręczne (test)

```bash
VAULT_PATH=/sciezka/do/folderu/z/notatkami node index.js
# albo
node index.js /sciezka/do/folderu/z/notatkami
```

Jeśli nie podasz ścieżki, serwer użyje folderu `./vault`.

## Podłączenie do Claude Desktop

Otwórz plik konfiguracyjny Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

i dodaj wpis (podmień ścieżki na własne):

```json
{
  "mcpServers": {
    "moje-notatki": {
      "command": "node",
      "args": ["/pelna/sciezka/do/obsidian-app/mcp-server/index.js"],
      "env": {
        "VAULT_PATH": "/pelna/sciezka/do/folderu/z/notatkami"
      }
    }
  }
}
```

Zrestartuj Claude Desktop. Powinien pojawić się serwer **„moje-notatki"** wraz z
listą narzędzi. Od tej chwili możesz np. poprosić: *„wypisz moje notatki"* albo
*„dopisz do notatki Pomysły punkt o…"*.

> 💡 Wskazówka: ustaw `VAULT_PATH` na **ten sam folder**, który otwierasz przez
> „Otwórz folder" w aplikacji webowej — wtedy AI i aplikacja pracują na tych
> samych plikach.

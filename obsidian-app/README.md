# 📝 Obsidian Clone — Twoja osobista aplikacja do notatek

Lekka aplikacja do notatek w stylu **Obsidian**, działająca w przeglądarce.
Twoje notatki to zwykłe pliki `.md` w folderze na dysku (tzw. *skarbiec* / vault) —
nic nie jest zamknięte w cudzej chmurze.

## ✨ Funkcje

- **Edytor Markdown** z podglądem na żywo (split: edycja po lewej, podgląd po prawej)
- **Linki `[[wiki]]`** — łącz notatki, z podpowiedziami nazw po wpisaniu `[[`
- **Backlinki** — zobacz, które notatki linkują do bieżącej
- **Graf powiązań** — interaktywna wizualizacja połączeń (przeciągaj węzły, klik otwiera notatkę)
- **Wyszukiwanie** pełnotekstowe po nazwach i treści
- **Quick Switcher** (Ctrl/⌘+K) — błyskawiczne przejście do notatki lub utworzenie nowej
- **Tagi `#tag`** — filtrowanie notatek po tagach
- **Skarbiec na dysku** — prawdziwe pliki `.md` (File System Access API) lub tryb demo w przeglądarce
- **Integracja MCP / „Aion Mind"** — asystent AI (np. Claude) czyta, pisze, łączy i porządkuje Twoje notatki
  (czat z wiedzą, auto-linkowanie, agent porządkujący, dzienna synteza). Zob. [`mcp-server/README.md`](mcp-server/README.md).

## 📁 Struktura projektu

```
obsidian-app/
├── web/          # Aplikacja webowa (Vite + React + TypeScript)
└── mcp-server/   # Serwer MCP (Node) – udostępnia skarbiec asystentom AI
```

## 🚀 Uruchomienie aplikacji webowej

```bash
cd web
npm install
npm run dev
```

Aplikacja otworzy się pod `http://localhost:5173`.

- Na start dostajesz kilka **przykładowych notatek** (zapisane w pamięci przeglądarki).
- Klik **„Otwórz folder"** (w przeglądarkach Chrome/Edge) podłącza prawdziwy folder z plikami `.md`.
  To ten sam folder, którego używa serwer MCP — zmiany są widoczne po obu stronach.

Budowanie wersji produkcyjnej:

```bash
cd web
npm run build      # wynik trafia do web/dist
npm run preview    # podgląd zbudowanej wersji
```

## 🤖 Integracja z AI przez MCP

Zobacz [`mcp-server/README.md`](mcp-server/README.md) — instrukcja podłączenia
notatek do Claude Desktop (czytanie, pisanie, wyszukiwanie, graf).

## 📦 Przeniesienie do osobnego repozytorium

Ten kod powstał na gałęzi roboczej w repo `.github`. Aby przenieść go do
dedykowanego repozytorium `obsidian-clone`:

1. Utwórz puste repo na GitHubie: <https://github.com/new> (nazwa np. `obsidian-clone`).
2. W terminalu, z katalogu `obsidian-app/`:

```bash
cd obsidian-app
git init
git add .
git commit -m "Pierwsza wersja aplikacji do notatek"
git branch -M main
git remote add origin https://github.com/djmisieq/obsidian-clone.git
git push -u origin main
```

Gotowe — cała aplikacja będzie w nowym repo.

## 🛣️ Pomysły na rozwój

- Eksport/import całego skarbca (ZIP)
- Tryb tylko-podgląd / tryb pełnoekranowy
- Osadzanie obrazów i załączników
- Wersja desktopowa (Tauri/Electron) z plikami na dysku bez ograniczeń przeglądarki
- Szyfrowanie notatek

import { useEffect, useMemo, useState } from "react";
import { useVault } from "./hooks/useVault";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { Backlinks } from "./components/Backlinks";
import { GraphView } from "./components/GraphView";
import { Search } from "./components/Search";

type View = "note" | "graph" | "search";

export default function App() {
  const vault = useVault();
  const [current, setCurrent] = useState<string | null>(null);
  const [view, setView] = useState<View>("note");
  const [draft, setDraft] = useState("");

  // Po wczytaniu skarbca otwórz pierwszą notatkę.
  useEffect(() => {
    if (!current && vault.notes.length > 0) {
      setCurrent(vault.notes[0].name);
    }
  }, [vault.notes, current]);

  // Zsynchronizuj edytor z aktualnie wybraną notatką.
  useEffect(() => {
    if (current) {
      const note = vault.getNote(current);
      setDraft(note?.content ?? "");
    }
  }, [current, vault]);

  // Autozapis z debounce.
  useEffect(() => {
    if (!current) return;
    const note = vault.getNote(current);
    if (note && note.content === draft) return;
    const id = setTimeout(() => {
      void vault.saveNote(current, draft);
    }, 500);
    return () => clearTimeout(id);
  }, [draft, current, vault]);

  const existing = useMemo(
    () => new Set(vault.notes.map((n) => n.name.toLowerCase())),
    [vault.notes],
  );
  const noteNames = useMemo(() => vault.notes.map((n) => n.name), [vault.notes]);

  function openNote(name: string) {
    const existingNote = vault.getNote(name);
    if (!existingNote) {
      // Klik w martwy link tworzy nową notatkę.
      void vault.createNote(name);
    }
    setCurrent(name);
    setView("note");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">📝 Moje Notatki</div>
        <nav className="views">
          <button className={view === "note" ? "active" : ""} onClick={() => setView("note")}>
            Notatka
          </button>
          <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
            Graf
          </button>
          <button className={view === "search" ? "active" : ""} onClick={() => setView("search")}>
            🔍 Szukaj
          </button>
        </nav>
        <div className="vault-info">
          <span title="Aktualny skarbiec">📁 {vault.store.label}</span>
          {vault.fsSupported && (
            <button onClick={() => void vault.openFolder()} title="Otwórz folder z plikami .md">
              Otwórz folder
            </button>
          )}
        </div>
      </header>

      <div className="body">
        <Sidebar
          notes={vault.notes}
          current={current}
          onSelect={openNote}
          onCreate={openNote}
          onDelete={(name) => {
            void vault.deleteNote(name);
            if (current === name) setCurrent(null);
          }}
        />

        <main className="content">
          {view === "search" && <Search notes={vault.notes} onOpen={openNote} />}

          {view === "graph" && (
            <GraphView notes={vault.notes} current={current} onOpen={openNote} />
          )}

          {view === "note" &&
            (current ? (
              <>
                <div className="note-header">
                  <h2>{current}</h2>
                </div>
                <div className="split">
                  <Editor value={draft} onChange={setDraft} noteNames={noteNames} />
                  <div className="preview-pane">
                    <Preview content={draft} existing={existing} onOpen={openNote} />
                    <Backlinks note={current} notes={vault.notes} onOpen={openNote} />
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>Wybierz notatkę z listy lub utwórz nową.</p>
              </div>
            ))}
        </main>
      </div>
    </div>
  );
}

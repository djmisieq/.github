import { useMemo, useState } from "react";
import type { Note } from "../vault/types";
import { extractTags } from "../vault/parse";

interface Props {
  notes: Note[];
  current: string | null;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
}

/** Lewy panel: lista notatek, tworzenie nowych, filtrowanie po tagach. */
export function Sidebar({ notes, current, onSelect, onCreate, onDelete }: Props) {
  const [newName, setNewName] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of extractTags(n.content)) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "pl"));
  }, [notes]);

  const visible = useMemo(() => {
    if (!activeTag) return notes;
    return notes.filter((n) => extractTags(n.content).includes(activeTag));
  }, [notes, activeTag]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  }

  return (
    <aside className="sidebar">
      <div className="new-note">
        <input
          value={newName}
          placeholder="Nowa notatka..."
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button onClick={handleCreate} title="Utwórz notatkę">+</button>
      </div>

      {allTags.length > 0 && (
        <div className="tags">
          {activeTag && (
            <button className="tag clear" onClick={() => setActiveTag(null)}>
              ✕ {activeTag}
            </button>
          )}
          {!activeTag &&
            allTags.map((t) => (
              <button key={t} className="tag" onClick={() => setActiveTag(t)}>
                #{t}
              </button>
            ))}
        </div>
      )}

      <ul className="note-list">
        {visible.map((n) => (
          <li
            key={n.name}
            className={n.name === current ? "active" : ""}
            onClick={() => onSelect(n.name)}
          >
            <span className="note-title">{n.name}</span>
            <button
              className="del"
              title="Usuń"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Usunąć notatkę „${n.name}"?`)) onDelete(n.name);
              }}
            >
              🗑
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="empty">Brak notatek</li>}
      </ul>
    </aside>
  );
}

import { useMemo, useState } from "react";
import type { Note } from "../vault/types";

interface Props {
  notes: Note[];
  onOpen: (name: string) => void;
}

interface Hit {
  name: string;
  snippet: string;
}

/** Wyszukiwarka pełnotekstowa po nazwach i treści notatek. */
export function Search({ notes, onOpen }: Props) {
  const [q, setQ] = useState("");

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out: Hit[] = [];
    for (const n of notes) {
      const inName = n.name.toLowerCase().includes(query);
      const idx = n.content.toLowerCase().indexOf(query);
      if (inName || idx !== -1) {
        let snippet = "";
        if (idx !== -1) {
          const start = Math.max(0, idx - 30);
          snippet = (start > 0 ? "…" : "") + n.content.slice(start, idx + query.length + 30).replace(/\n/g, " ") + "…";
        }
        out.push({ name: n.name, snippet });
      }
    }
    return out;
  }, [q, notes]);

  return (
    <div className="search">
      <input
        autoFocus
        value={q}
        placeholder="Szukaj w notatkach..."
        onChange={(e) => setQ(e.target.value)}
      />
      <ul>
        {hits.map((h) => (
          <li key={h.name} onClick={() => onOpen(h.name)}>
            <strong>{h.name}</strong>
            {h.snippet && <span className="snippet">{h.snippet}</span>}
          </li>
        ))}
        {q.trim() && hits.length === 0 && <li className="empty">Brak wyników</li>}
      </ul>
    </div>
  );
}

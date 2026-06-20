import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  noteNames: string[];
  onOpen: (name: string) => void;
  onClose: () => void;
}

/** Proste dopasowanie rozmyte: wszystkie znaki zapytania w kolejności w nazwie. */
function fuzzy(query: string, name: string): boolean {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let i = 0;
  for (const ch of n) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return q.length === 0;
}

/**
 * Szybki przełącznik notatek (Ctrl/⌘+K) — wzorowany na Obsidianie.
 * Filtruje notatki rozmyto, Enter otwiera, a gdy brak trafień — tworzy nową.
 */
export function QuickSwitcher({ noteNames, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    if (!query.trim()) return noteNames.slice(0, 50);
    return noteNames.filter((n) => fuzzy(query.trim(), n)).slice(0, 50);
  }, [query, noteNames]);

  useEffect(() => setActive(0), [query]);

  const exactExists = noteNames.some((n) => n.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 0 && !exactExists;

  function choose(name: string) {
    onOpen(name);
    onClose();
  }

  return (
    <div className="qs-overlay" onClick={onClose}>
      <div className="qs-box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="qs-input"
          value={query}
          placeholder="Przejdź do notatki lub utwórz nową..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const total = matches.length + (canCreate ? 1 : 0);
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % Math.max(1, total));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + Math.max(1, total)) % Math.max(1, total));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (active < matches.length) choose(matches[active]);
              else if (canCreate) choose(query.trim());
            }
          }}
        />
        <ul className="qs-list">
          {matches.map((m, i) => (
            <li key={m} className={i === active ? "active" : ""} onMouseDown={() => choose(m)}>
              {m}
            </li>
          ))}
          {canCreate && (
            <li
              className={active === matches.length ? "active create" : "create"}
              onMouseDown={() => choose(query.trim())}
            >
              ➕ Utwórz „{query.trim()}"
            </li>
          )}
          {matches.length === 0 && !canCreate && <li className="empty">Brak notatek</li>}
        </ul>
      </div>
    </div>
  );
}

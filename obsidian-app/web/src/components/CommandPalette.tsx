import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

/** Paleta poleceń (Ctrl/⌘+P) — szybkie wykonywanie akcji bez myszki. */
export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => setActive(0), [query]);

  function exec(cmd: Command) {
    onClose();
    cmd.run();
  }

  return (
    <div className="qs-overlay" onClick={onClose}>
      <div className="qs-box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="qs-input"
          value={query}
          placeholder="Wpisz polecenie..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % Math.max(1, matches.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + Math.max(1, matches.length)) % Math.max(1, matches.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (matches[active]) exec(matches[active]);
            }
          }}
        />
        <ul className="qs-list">
          {matches.map((c, i) => (
            <li key={c.id} className={i === active ? "active" : ""} onMouseDown={() => exec(c)}>
              <span>{c.label}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
            </li>
          ))}
          {matches.length === 0 && <li className="empty">Brak poleceń</li>}
        </ul>
      </div>
    </div>
  );
}

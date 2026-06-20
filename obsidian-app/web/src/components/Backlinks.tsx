import type { Note } from "../vault/types";
import { findBacklinks } from "../vault/parse";

interface Props {
  note: string;
  notes: Note[];
  onOpen: (name: string) => void;
}

/** Panel backlinków – pokazuje, które notatki linkują do bieżącej. */
export function Backlinks({ note, notes, onOpen }: Props) {
  const links = findBacklinks(note, notes);
  return (
    <div className="backlinks">
      <h4>Powiązane (backlinki)</h4>
      {links.length === 0 ? (
        <p className="muted">Żadna notatka jeszcze tu nie linkuje.</p>
      ) : (
        <ul>
          {links.map((l) => (
            <li key={l}>
              <a href="#" onClick={(e) => { e.preventDefault(); onOpen(l); }}>{l}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

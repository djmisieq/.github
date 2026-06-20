import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Nazwy wszystkich notatek – do podpowiedzi po wpisaniu [[. */
  noteNames: string[];
}

/**
 * Edytor Markdown (textarea) z podpowiedziami nazw notatek po wpisaniu "[[".
 */
export function Editor({ value, onChange, noteNames }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggest, setSuggest] = useState<{ query: string; from: number } | null>(null);
  const [active, setActive] = useState(0);

  // Wykrywa, czy kursor jest tuż za "[[" i jaki fragment już wpisano.
  function detectSuggest(el: HTMLTextAreaElement) {
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const open = before.lastIndexOf("[[");
    if (open === -1) return setSuggest(null);
    const between = before.slice(open + 2);
    // Jeśli zamknięto nawias lub jest nowa linia – nie podpowiadamy.
    if (between.includes("]]") || between.includes("\n")) return setSuggest(null);
    setSuggest({ query: between, from: open + 2 });
    setActive(0);
  }

  const matches = suggest
    ? noteNames.filter((n) => n.toLowerCase().includes(suggest.query.toLowerCase())).slice(0, 8)
    : [];

  function applySuggestion(name: string) {
    const el = ref.current;
    if (!el || !suggest) return;
    const pos = el.selectionStart;
    const head = value.slice(0, suggest.from) + name + "]]";
    const tail = value.slice(pos);
    const next = head + tail;
    onChange(next);
    setSuggest(null);
    // Ustaw kursor za wstawionym linkiem.
    requestAnimationFrame(() => {
      el.focus();
      const caret = head.length;
      el.setSelectionRange(caret, caret);
    });
  }

  useEffect(() => {
    setSuggest(null);
  }, [value === "" ? "" : null]);

  return (
    <div className="editor-wrap">
      <textarea
        ref={ref}
        className="editor"
        value={value}
        spellCheck={false}
        placeholder="Pisz w Markdown... Użyj [[ aby połączyć z inną notatką."
        onChange={(e) => {
          onChange(e.target.value);
          detectSuggest(e.target);
        }}
        onClick={(e) => detectSuggest(e.currentTarget)}
        onKeyDown={(e) => {
          if (!suggest || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            applySuggestion(matches[active]);
          } else if (e.key === "Escape") {
            setSuggest(null);
          }
        }}
      />
      {suggest && matches.length > 0 && (
        <ul className="suggest">
          {matches.map((m, i) => (
            <li
              key={m}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(m);
              }}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { marked } from "marked";
import { splitWikilink } from "../vault/parse";

interface Props {
  content: string;
  /** Zbiór istniejących nazw notatek (małymi literami) – do oznaczania martwych linków. */
  existing: Set<string>;
  onOpen: (name: string) => void;
}

marked.setOptions({ gfm: true, breaks: true });

/** Zamienia [[Notatka|alias]] na klikalne odnośniki przed renderem Markdown. */
function replaceWikilinks(src: string, existing: Set<string>): string {
  return src.replace(/\[\[([^\]]+)\]\]/g, (_all, inner: string) => {
    const { target, alias } = splitWikilink(inner);
    const cls = existing.has(target.toLowerCase()) ? "wikilink" : "wikilink missing";
    const safeTarget = target.replace(/"/g, "&quot;");
    const safeAlias = alias.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<a href="#" class="${cls}" data-note="${safeTarget}">${safeAlias}</a>`;
  });
}

export function Preview({ content, existing, onOpen }: Props) {
  const html = useMemo(() => {
    const withLinks = replaceWikilinks(content, existing);
    return marked.parse(withLinks) as string;
  }, [content, existing]);

  return (
    <div
      className="preview"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const link = target.closest("a.wikilink") as HTMLElement | null;
        if (link) {
          e.preventDefault();
          const note = link.getAttribute("data-note");
          if (note) onOpen(note);
        }
      }}
    />
  );
}

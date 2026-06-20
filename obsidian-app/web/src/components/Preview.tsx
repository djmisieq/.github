import { useMemo } from "react";
import { marked } from "marked";
import { splitWikilink } from "../vault/parse";

interface Props {
  content: string;
  /** Zbiór istniejących nazw notatek (małymi literami) – do oznaczania martwych linków. */
  existing: Set<string>;
  onOpen: (name: string) => void;
  /** Zwraca treść notatki o danej nazwie (do osadzania ![[...]]), albo null. */
  resolve?: (name: string) => string | null;
}

marked.setOptions({ gfm: true, breaks: true });

/** Zamienia [[Notatka|alias]] na klikalne odnośniki przed renderem Markdown. */
function replaceWikilinks(src: string, existing: Set<string>): string {
  return src.replace(/(?<!!)\[\[([^\]]+)\]\]/g, (_all, inner: string) => {
    const { target, alias } = splitWikilink(inner);
    const cls = existing.has(target.toLowerCase()) ? "wikilink" : "wikilink missing";
    const safeTarget = target.replace(/"/g, "&quot;");
    const safeAlias = alias.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<a href="#" class="${cls}" data-note="${safeTarget}">${safeAlias}</a>`;
  });
}

/**
 * Renderuje Markdown do HTML, obsługując osadzanie notatek ![[Nazwa]].
 * Osadzone notatki renderowane są rekurencyjnie (z limitem głębokości, by uniknąć pętli).
 */
function renderMarkdown(
  src: string,
  existing: Set<string>,
  resolve: ((name: string) => string | null) | undefined,
  depth: number,
): string {
  const embeds: { token: string; target: string }[] = [];
  // Zamień ![[Nazwa]] na unikalne placeholdery (renderowane osobno po marked).
  const withPlaceholders = src.replace(/!\[\[([^\]\n]+)\]\]/g, (_all, inner: string) => {
    const { target } = splitWikilink(inner);
    const token = `%%EMBED_${embeds.length}%%`;
    embeds.push({ token, target });
    return `\n\n${token}\n\n`;
  });

  let html = marked.parse(replaceWikilinks(withPlaceholders, existing)) as string;

  for (const { token, target } of embeds) {
    let inner: string;
    const resolved = resolve?.(target) ?? null;
    if (resolved == null) {
      inner = `<div class="embed missing">📄 Brak notatki „${target}"</div>`;
    } else if (depth >= 2) {
      inner = `<div class="embed"><a href="#" class="wikilink" data-note="${target}">📄 ${target}</a> (zbyt głębokie osadzenie)</div>`;
    } else {
      const body = renderMarkdown(resolved, existing, resolve, depth + 1);
      inner =
        `<div class="embed">` +
        `<div class="embed-title"><a href="#" class="wikilink" data-note="${target}">📄 ${target}</a></div>` +
        `<div class="embed-body">${body}</div></div>`;
    }
    // Placeholder trafia do marked owinięty w <p>…</p> — podmieniamy całość.
    html = html.replace(new RegExp(`<p>${token}</p>|${token}`), inner);
  }
  return html;
}

export function Preview({ content, existing, onOpen, resolve }: Props) {
  const html = useMemo(
    () => renderMarkdown(content, existing, resolve, 0),
    [content, existing, resolve],
  );

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

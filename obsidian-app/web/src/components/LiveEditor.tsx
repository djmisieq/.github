import { useEffect, useRef } from "react";
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { tags } from "@lezer/highlight";

interface Props {
  value: string;
  onChange: (next: string) => void;
  noteNames: string[];
  onOpen: (name: string) => void;
}

// Kolory podświetlania składni Markdown (spójne z motywem aplikacji).
const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700", color: "#e8eaff" },
  { tag: tags.heading2, fontSize: "1.4em", fontWeight: "700", color: "#e2e5ff" },
  { tag: tags.heading3, fontSize: "1.2em", fontWeight: "700", color: "#dde1ff" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700", color: "#dde1ff" },
  { tag: tags.strong, fontWeight: "700", color: "#fff" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, color: "#9ad29a", fontFamily: "monospace" },
  { tag: tags.quote, color: "#8b90ad" },
  { tag: tags.url, color: "#8aa0ff" },
  { tag: tags.link, color: "#8aa0ff" },
]);

/** Znaczniki formatowania (np. # ** _ `), które chowamy poza aktywną linią. */
const HIDDEN_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "QuoteMark",
]);

/**
 * Plugin "live preview": chowa znaczniki Markdown we wszystkich liniach
 * poza tą, w której jest kursor — dzięki temu tekst wygląda jak sformatowany,
 * a po wejściu w linię widać surową składnię (tak jak w Obsidianie).
 */
const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = this.build(u.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (node) => {
            if (!HIDDEN_MARKS.has(node.name)) return;
            const line = view.state.doc.lineAt(node.from).number;
            if (line === activeLine) return; // w aktywnej linii pokazujemy składnię
            // Chowamy sam znacznik (i ewentualną spację po nagłówku).
            let end = node.to;
            if (node.name === "HeaderMark" && view.state.doc.sliceString(end, end + 1) === " ") end++;
            builder.add(node.from, end, Decoration.replace({}));
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

// --- Wikilinki [[...]] i tagi #tag (poza gramatyką Markdown) ----------------

class WikiWidget extends WidgetType {
  constructor(readonly target: string, readonly label: string, readonly embed = false) {
    super();
  }
  eq(other: WikiWidget) {
    return other.target === this.target && other.label === this.label && other.embed === this.embed;
  }
  toDOM() {
    const a = document.createElement("a");
    a.className = this.embed ? "cm-wikilink cm-embed-chip" : "cm-wikilink";
    a.textContent = this.embed ? `📄 ${this.label}` : this.label;
    a.dataset.note = this.target;
    return a;
  }
  ignoreEvent() {
    return false;
  }
}

const WIKI_RE = /(!?)\[\[([^\]\n]+)\]\]/g;
const TAG_RE = /(^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gu;

/** Renderuje [[linki]] i osadzenia ![[...]] jako klikalne elementy oraz koloruje #tagi (poza aktywną linią). */
const wikiAndTags = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = this.build(u.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const m of text.matchAll(WIKI_RE)) {
          const start = from + m.index!;
          const end = start + m[0].length;
          const line = view.state.doc.lineAt(start).number;
          const isEmbed = m[1] === "!";
          const [target, alias] = m[2].includes("|") ? m[2].split("|") : [m[2], m[2]];
          if (line === activeLine) {
            builder.add(start, end, Decoration.mark({ class: "cm-wikilink-raw" }));
          } else {
            builder.add(
              start,
              end,
              Decoration.replace({ widget: new WikiWidget(target.trim(), alias.trim(), isEmbed) }),
            );
          }
        }
      }
      return this.merge(view, builder.finish());
    }
    merge(view: EditorView, wiki: DecorationSet): DecorationSet {
      const all: { from: number; to: number; deco: Decoration }[] = [];
      const iter = wiki.iter();
      while (iter.value) {
        all.push({ from: iter.from, to: iter.to, deco: iter.value });
        iter.next();
      }
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const m of text.matchAll(TAG_RE)) {
          const start = from + m.index! + m[1].length;
          const end = start + 1 + m[2].length;
          all.push({ from: start, to: end, deco: Decoration.mark({ class: "cm-tag" }) });
        }
      }
      all.sort((a, b) => a.from - b.from || a.to - b.to);
      const builder = new RangeSetBuilder<Decoration>();
      for (const r of all) builder.add(r.from, r.to, r.deco);
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px" },
  ".cm-content": { fontFamily: '"SF Mono", "Cascadia Code", Consolas, monospace', padding: "18px 0" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.7" },
  "&.cm-focused": { outline: "none" },
});

export function LiveEditor({ value, onChange, noteNames, onOpen }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Najnowsze callbacki/dane bez przebudowy edytora.
  const onChangeRef = useRef(onChange);
  const onOpenRef = useRef(onOpen);
  const namesRef = useRef(noteNames);
  onChangeRef.current = onChange;
  onOpenRef.current = onOpen;
  namesRef.current = noteNames;

  useEffect(() => {
    if (!host.current) return;

    // Podpowiedzi nazw notatek po wpisaniu [[
    function wikiComplete(ctx: CompletionContext) {
      const before = ctx.matchBefore(/\[\[([^\]\n]*)$/);
      if (!before) return null;
      const query = before.text.slice(2).toLowerCase();
      const options = namesRef.current
        .filter((n) => n.toLowerCase().includes(query))
        .slice(0, 12)
        .map((n) => ({ label: n, apply: `${n}]]`, type: "text" }));
      return { from: before.from + 2, options };
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(mdHighlight),
        livePreview,
        wikiAndTags,
        autocompletion({ override: [wikiComplete] }),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          mousedown: (e) => {
            const t = e.target as HTMLElement;
            if (t.classList.contains("cm-wikilink")) {
              e.preventDefault();
              const note = t.dataset.note;
              if (note) onOpenRef.current(note);
              return true;
            }
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronizacja treści z zewnątrz (np. przełączenie notatki).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (value !== cur) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  return <div className="live-editor" ref={host} />;
}

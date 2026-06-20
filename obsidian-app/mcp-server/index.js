#!/usr/bin/env node
// Serwer MCP dla skarbca notatek w stylu Obsidian.
// Operuje na folderze z plikami .md (tym samym, który otwiera aplikacja webowa),
// dzięki czemu asystent AI (np. Claude) może czytać i edytować Twoje notatki.
//
// Uruchomienie:  VAULT_PATH=/sciezka/do/folderu node index.js
//           lub:  node index.js /sciezka/do/folderu

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";

// --- Konfiguracja skarbca -------------------------------------------------
const VAULT = path.resolve(process.argv[2] || process.env.VAULT_PATH || "./vault");

/** Bezpieczne złożenie ścieżki pliku notatki – blokuje ucieczkę poza skarbiec. */
function notePath(name) {
  const clean = String(name).replace(/\.md$/i, "");
  const file = path.resolve(VAULT, `${clean}.md`);
  if (!file.startsWith(VAULT + path.sep) && file !== path.join(VAULT, `${clean}.md`)) {
    throw new Error(`Niedozwolona nazwa notatki: ${name}`);
  }
  return file;
}

async function ensureVault() {
  await fs.mkdir(VAULT, { recursive: true });
}

async function listNotes() {
  await ensureVault();
  const entries = await fs.readdir(VAULT, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => e.name.replace(/\.md$/i, ""))
    .sort((a, b) => a.localeCompare(b, "pl"));
}

async function readNote(name) {
  return fs.readFile(notePath(name), "utf8");
}

// Wyciąganie linków [[...]] (z obsługą aliasów [[cel|tekst]]).
function extractLinks(content) {
  const out = new Set();
  for (const m of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = m[1].split("|")[0].trim();
    if (target) out.add(target);
  }
  return [...out];
}

// Wyciąganie tagów #tag (bez znaku #).
function extractTags(content) {
  const out = new Set();
  for (const m of content.matchAll(/(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gu)) out.add(m[1]);
  return [...out];
}

// Bardzo krótkie słowa i częste wyrazy pomijamy przy szukaniu podobieństwa.
const STOP = new Set(
  ("i oraz lub a w we z ze na do od po za o u to to że co jak czy nie tak jest są być " +
    "the and for that this with from have are was you your not but all can").split(" "),
);

/** Zamienia treść na zbiór znaczących słów (małe litery, bez krótkich i stop-słów). */
function tokenize(content) {
  const words = content
    .toLowerCase()
    .replace(/\[\[[^\]]*\]\]/g, " ") // usuń linki
    .replace(/[#`*_>\-\[\]()!.,:;"'/\\]/g, " ")
    .split(/\s+/);
  const set = new Set();
  for (const w of words) if (w.length > 3 && !STOP.has(w)) set.add(w);
  return set;
}

/**
 * Dla danej notatki znajduje najbardziej podobne, jeszcze niepołączone notatki.
 * Używa podobieństwa kosinusowego na wektorach TF-IDF (ważone znaczenie słów).
 */
async function suggestLinks(name, limit = 5) {
  const target = await readNote(name);
  const alreadyLinked = new Set(extractLinks(target).map((l) => l.toLowerCase()));
  const { docs } = await buildIndex();
  const self = docs.find((d) => d.name === name);
  if (!self) return [];
  const scored = [];
  for (const doc of docs) {
    if (doc.name === name || alreadyLinked.has(doc.name.toLowerCase())) continue;
    const sim = cosine(self.vec, self.norm, doc.vec, doc.norm);
    if (sim <= 0) continue;
    // Najważniejsze wspólne słowa (do wyjaśnienia powiązania).
    const common = [];
    for (const [w, v] of self.vec) if (doc.vec.has(w)) common.push([w, v]);
    common.sort((a, b) => b[1] - a[1]);
    scored.push({ note: doc.name, score: sim, common: common.slice(0, 6).map(([w]) => w) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Nazwa dzisiejszej notatki dziennej, np. 2026-06-20. */
function todayName() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// === Wyszukiwanie semantyczne (TF-IDF + podobieństwo kosinusowe) ============
// Uwaga: to wersja leksykalno-semantyczna (waży znaczenie słów), bez modelu
// neuronowego — dzięki temu działa bez kluczy API i zależności. Architektura
// pozwala później podmienić to na prawdziwe embeddingi.

/** Liczy częstość słów w treści (z pominięciem stop-słów i krótkich wyrazów). */
function termFreq(content) {
  const tf = new Map();
  const lowered = content
    .toLowerCase()
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/[#`*_>\-\[\]()!.,:;"'/\\]/g, " ");
  for (const w of lowered.split(/\s+/)) {
    if (w.length > 3 && !STOP.has(w)) tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  return tf;
}

/** Buduje indeks TF-IDF nad wszystkimi notatkami skarbca. */
async function buildIndex() {
  const names = await listNotes();
  const docs = [];
  const df = new Map(); // ile dokumentów zawiera dane słowo
  for (const name of names) {
    const tf = termFreq(await readNote(name));
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    docs.push({ name, tf });
  }
  const N = Math.max(1, docs.length);
  const idf = new Map();
  for (const [w, d] of df) idf.set(w, Math.log(1 + N / d));

  // Wektory TF-IDF + ich normy.
  for (const doc of docs) {
    const vec = new Map();
    let sum = 0;
    for (const [w, c] of doc.tf) {
      const v = c * (idf.get(w) ?? 0);
      vec.set(w, v);
      sum += v * v;
    }
    doc.vec = vec;
    doc.norm = Math.sqrt(sum) || 1;
  }
  return { docs, idf };
}

/** Wektor TF-IDF dla zapytania (lub dowolnego tekstu) w przestrzeni danego idf. */
function vectorize(text, idf) {
  const tf = termFreq(text);
  const vec = new Map();
  let sum = 0;
  for (const [w, c] of tf) {
    const v = c * (idf.get(w) ?? Math.log(2)); // nieznane słowo: lekka waga
    vec.set(w, v);
    sum += v * v;
  }
  return { vec, norm: Math.sqrt(sum) || 1 };
}

/** Podobieństwo kosinusowe dwóch rzadkich wektorów (Map). */
function cosine(a, an, b, bn) {
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [w, v] of small) {
    const o = large.get(w);
    if (o) dot += v * o;
  }
  return dot / (an * bn);
}

// --- Definicja serwera ----------------------------------------------------
const server = new McpServer({
  name: "obsidian-clone-mcp",
  version: "0.1.0",
});

server.registerTool(
  "list_notes",
  {
    title: "Lista notatek",
    description: "Zwraca nazwy wszystkich notatek w skarbcu.",
    inputSchema: {},
  },
  async () => {
    const notes = await listNotes();
    return { content: [{ type: "text", text: notes.join("\n") || "(skarbiec jest pusty)" }] };
  },
);

server.registerTool(
  "read_note",
  {
    title: "Czytaj notatkę",
    description: "Zwraca treść Markdown wskazanej notatki.",
    inputSchema: { name: z.string().describe("Nazwa notatki bez rozszerzenia .md") },
  },
  async ({ name }) => {
    try {
      const content = await readNote(name);
      return { content: [{ type: "text", text: content }] };
    } catch {
      return { content: [{ type: "text", text: `Nie znaleziono notatki: ${name}` }], isError: true };
    }
  },
);

server.registerTool(
  "write_note",
  {
    title: "Zapisz notatkę",
    description: "Tworzy nową lub nadpisuje istniejącą notatkę treścią Markdown.",
    inputSchema: {
      name: z.string().describe("Nazwa notatki bez rozszerzenia .md"),
      content: z.string().describe("Pełna treść Markdown notatki"),
    },
  },
  async ({ name, content }) => {
    await ensureVault();
    await fs.writeFile(notePath(name), content, "utf8");
    return { content: [{ type: "text", text: `Zapisano notatkę: ${name}` }] };
  },
);

server.registerTool(
  "delete_note",
  {
    title: "Usuń notatkę",
    description: "Usuwa wskazaną notatkę ze skarbca.",
    inputSchema: { name: z.string().describe("Nazwa notatki bez rozszerzenia .md") },
  },
  async ({ name }) => {
    try {
      await fs.unlink(notePath(name));
      return { content: [{ type: "text", text: `Usunięto notatkę: ${name}` }] };
    } catch {
      return { content: [{ type: "text", text: `Nie znaleziono notatki: ${name}` }], isError: true };
    }
  },
);

server.registerTool(
  "search_notes",
  {
    title: "Szukaj w notatkach",
    description: "Wyszukuje frazę w nazwach i treści notatek. Zwraca pasujące notatki z fragmentem.",
    inputSchema: { query: z.string().describe("Szukana fraza") },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const names = await listNotes();
    const hits = [];
    for (const name of names) {
      const content = await readNote(name);
      const idx = content.toLowerCase().indexOf(q);
      if (name.toLowerCase().includes(q) || idx !== -1) {
        const snippet =
          idx !== -1
            ? content.slice(Math.max(0, idx - 40), idx + q.length + 40).replace(/\n/g, " ")
            : "";
        hits.push(`• ${name}${snippet ? `: …${snippet}…` : ""}`);
      }
    }
    return {
      content: [{ type: "text", text: hits.join("\n") || `Brak wyników dla: ${query}` }],
    };
  },
);

server.registerTool(
  "get_backlinks",
  {
    title: "Backlinki",
    description: "Zwraca nazwy notatek, które linkują [[...]] do podanej notatki.",
    inputSchema: { name: z.string().describe("Nazwa notatki, do której szukamy odnośników") },
  },
  async ({ name }) => {
    const target = name.toLowerCase();
    const names = await listNotes();
    const back = [];
    for (const n of names) {
      if (n === name) continue;
      const content = await readNote(n);
      if (extractLinks(content).some((l) => l.toLowerCase() === target)) back.push(n);
    }
    return { content: [{ type: "text", text: back.join("\n") || "(brak backlinków)" }] };
  },
);

server.registerTool(
  "get_graph",
  {
    title: "Graf powiązań",
    description: "Zwraca strukturę grafu (węzły i krawędzie linków [[...]]) jako JSON.",
    inputSchema: {},
  },
  async () => {
    const names = await listNotes();
    const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
    const edges = [];
    for (const n of names) {
      const content = await readNote(n);
      for (const link of extractLinks(content)) {
        const target = lower.get(link.toLowerCase());
        if (target && target !== n) edges.push({ source: n, target });
      }
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ nodes: names, edges }, null, 2) }],
    };
  },
);

// === Warstwa "Aion Mind": narzędzia wspierające pracę AI z wiedzą ==========

server.registerTool(
  "append_to_note",
  {
    title: "Dopisz do notatki",
    description:
      "Dopisuje treść na końcu notatki (nie nadpisuje). Tworzy notatkę, jeśli nie istnieje. " +
      "Przydatne, gdy agent dorzuca myśli, linki lub podsumowania.",
    inputSchema: {
      name: z.string().describe("Nazwa notatki bez .md"),
      content: z.string().describe("Treść Markdown do dopisania na końcu"),
    },
  },
  async ({ name, content }) => {
    await ensureVault();
    let existing = "";
    try {
      existing = await readNote(name);
    } catch {
      /* nowa notatka */
    }
    const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
    await fs.writeFile(notePath(name), existing + sep + content, "utf8");
    return { content: [{ type: "text", text: `Dopisano do notatki: ${name}` }] };
  },
);

server.registerTool(
  "suggest_links",
  {
    title: "Zaproponuj połączenia",
    description:
      "Dla wskazanej notatki znajduje inne, tematycznie podobne, jeszcze niepołączone notatki " +
      "(podobieństwo kosinusowe TF-IDF). Zwraca kandydatów do dodania linków [[...]].",
    inputSchema: { name: z.string().describe("Nazwa notatki bez .md") },
  },
  async ({ name }) => {
    const sug = await suggestLinks(name);
    if (sug.length === 0) {
      return { content: [{ type: "text", text: "Brak oczywistych kandydatów do połączenia." }] };
    }
    const text = sug
      .map((s) => `• [[${s.note}]] (wspólne: ${s.common.join(", ")})`)
      .join("\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "semantic_search",
  {
    title: "Wyszukiwanie semantyczne",
    description:
      "Wyszukuje notatki najbardziej pasujące znaczeniowo do zapytania (TF-IDF + podobieństwo " +
      "kosinusowe). W odróżnieniu od search_notes nie wymaga dokładnego słowa — szereguje po trafności.",
    inputSchema: {
      query: z.string().describe("Pytanie lub opis tematu w języku naturalnym"),
      limit: z.number().int().min(1).max(20).optional().describe("Ile wyników (domyślnie 8)"),
    },
  },
  async ({ query, limit }) => {
    const { docs, idf } = await buildIndex();
    const q = vectorize(query, idf);
    const scored = docs
      .map((d) => ({ name: d.name, score: cosine(q.vec, q.norm, d.vec, d.norm) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit ?? 8);
    if (scored.length === 0) {
      return { content: [{ type: "text", text: `Brak trafień dla: ${query}` }] };
    }
    const text = scored.map((s) => `• ${s.name}  (trafność ${s.score.toFixed(3)})`).join("\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "get_orphans",
  {
    title: "Notatki-sieroty",
    description: "Zwraca notatki bez żadnych połączeń (nie linkują i nie są linkowane). Kandydaci do uporządkowania.",
    inputSchema: {},
  },
  async () => {
    const names = await listNotes();
    const linked = new Set();
    const contents = new Map();
    for (const n of names) contents.set(n, await readNote(n));
    const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
    for (const n of names) {
      for (const link of extractLinks(contents.get(n))) {
        const t = lower.get(link.toLowerCase());
        if (t && t !== n) {
          linked.add(n);
          linked.add(t);
        }
      }
    }
    const orphans = names.filter((n) => !linked.has(n));
    return { content: [{ type: "text", text: orphans.join("\n") || "(brak sierot — wszystko połączone)" }] };
  },
);

server.registerTool(
  "get_all_tags",
  {
    title: "Wszystkie tagi",
    description: "Zwraca listę tagów wraz z liczbą notatek, w których występują.",
    inputSchema: {},
  },
  async () => {
    const counts = new Map();
    for (const n of await listNotes()) {
      for (const t of extractTags(await readNote(n))) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const text = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `#${t} (${c})`)
      .join("\n");
    return { content: [{ type: "text", text: text || "(brak tagów)" }] };
  },
);

server.registerTool(
  "get_notes_by_tag",
  {
    title: "Notatki po tagu",
    description: "Zwraca nazwy notatek oznaczonych podanym tagiem.",
    inputSchema: { tag: z.string().describe("Tag bez znaku # (np. pomysly)") },
  },
  async ({ tag }) => {
    const want = tag.replace(/^#/, "").toLowerCase();
    const out = [];
    for (const n of await listNotes()) {
      if (extractTags(await readNote(n)).some((t) => t.toLowerCase() === want)) out.push(n);
    }
    return { content: [{ type: "text", text: out.join("\n") || `(brak notatek z tagiem #${want})` }] };
  },
);

server.registerTool(
  "daily_note",
  {
    title: "Notatka dzienna",
    description:
      "Zwraca (tworząc w razie potrzeby) dzisiejszą notatkę dzienną w formacie RRRR-MM-DD. " +
      "Podstawa do codziennej syntezy i szybkiego zapisu.",
    inputSchema: {},
  },
  async () => {
    const name = todayName();
    let content;
    try {
      content = await readNote(name);
    } catch {
      content = `# ${name}\n\n## Notatki dnia\n\n`;
      await fs.writeFile(notePath(name), content, "utf8");
    }
    return { content: [{ type: "text", text: `# ${name}\n\n${content}` }] };
  },
);

// === "Komendy" (MCP prompts) — w Claude Desktop pojawią się jako gotowe akcje =

server.registerPrompt(
  "porzadkuj_notatki",
  {
    title: "Uporządkuj notatki",
    description: "Agent przegląda notatki-sieroty i proponuje dla nich tagi oraz połączenia.",
    argsSchema: {},
  },
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Jesteś moim asystentem wiedzy. Użyj narzędzia get_orphans, by znaleźć notatki bez połączeń. " +
            "Dla każdej: przeczytaj ją (read_note), zaproponuj 2-4 trafne tagi #tag oraz powiązania (suggest_links). " +
            "Pokaż mi propozycje do akceptacji ZANIM cokolwiek zapiszesz. Po akceptacji użyj append_to_note.",
        },
      },
    ],
  }),
);

server.registerPrompt(
  "znajdz_polaczenia",
  {
    title: "Znajdź połączenia",
    description: "Agent szuka brakujących powiązań między notatkami i proponuje linki [[...]].",
    argsSchema: { notatka: z.string().describe("Nazwa notatki, dla której szukamy połączeń") },
  },
  ({ notatka }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Dla notatki „${notatka}" użyj suggest_links, oceń trafność każdego kandydata na podstawie treści ` +
            `(read_note) i zaproponuj konkretne zdania z linkami [[...]] do dopisania. Zapisz dopiero po mojej zgodzie.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "dzienna_synteza",
  {
    title: "Dzienna synteza",
    description: "Agent zbiera ostatnie notatki i tworzy syntezę w notatce dziennej.",
    argsSchema: {},
  },
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Wykonaj dzienną syntezę: 1) daily_note, by otworzyć dzisiejszą notatkę; 2) list_notes i przejrzyj " +
            "notatki zmienione/istotne; 3) napisz zwięzłe podsumowanie głównych wątków, otwartych pytań i powiązań, " +
            "a następnie append_to_note do dzisiejszej notatki. Dodaj linki [[...]] do omawianych notatek.",
        },
      },
    ],
  }),
);

// --- Start ----------------------------------------------------------------
async function main() {
  await ensureVault();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[obsidian-clone-mcp] Skarbiec: ${VAULT}`);
}

main().catch((err) => {
  console.error("[obsidian-clone-mcp] Błąd:", err);
  process.exit(1);
});

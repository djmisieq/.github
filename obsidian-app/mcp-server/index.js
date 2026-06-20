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

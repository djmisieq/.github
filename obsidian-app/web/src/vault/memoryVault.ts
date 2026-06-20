import type { Note, VaultStore } from "./types";

const STORAGE_KEY = "obsidian-clone:vault";

/** Kilka przykładowych notatek pokazujących możliwości aplikacji. */
const SEED: Note[] = [
  {
    name: "Witaj",
    content: `# Witaj w Twoich notatkach 👋

To jest aplikacja w stylu **Obsidian**, działająca w przeglądarce.

## Co możesz robić
- Pisać notatki w **Markdown**
- Łączyć je linkami [[Pomysły]] (kliknij, by przejść)
- Oznaczać tagami #start #notatki
- Zobaczyć [[Graf]] powiązań
- Wyszukiwać treść (lupka po lewej)

> Wskazówka: wpisz \`[[\` w edytorze, by zobaczyć podpowiedzi nazw notatek.
`,
  },
  {
    name: "Pomysły",
    content: `# Pomysły

Lista pomysłów na notatki. Powiązane z [[Witaj]].

- [ ] Dziennik #dziennik
- [ ] Plan tygodnia #plan
- [ ] Książki do przeczytania

Zobacz też [[Graf]].
`,
  },
  {
    name: "Graf",
    content: `# Graf

Widok grafu pokazuje połączenia między notatkami.
Każdy link [[Witaj]] albo [[Pomysły]] tworzy krawędź. #start
`,
  },
];

/**
 * Magazyn w pamięci, zapisywany do localStorage.
 * Działa w każdej przeglądarce — używany jako tryb demo
 * lub gdy File System Access API nie jest dostępne.
 */
export class MemoryVault implements VaultStore {
  readonly label = "Pamięć przeglądarki (demo)";
  private notes: Map<string, Note>;

  constructor() {
    this.notes = new Map();
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as Note[];
        for (const n of arr) this.notes.set(n.name, n);
        return;
      }
    } catch {
      // uszkodzone dane – zaczynamy od przykładów
    }
    for (const n of SEED) this.notes.set(n.name, n);
    this.persist();
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.notes.values()]));
  }

  async list(): Promise<Note[]> {
    return [...this.notes.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async save(name: string, content: string): Promise<void> {
    this.notes.set(name, { name, content });
    this.persist();
  }

  async remove(name: string): Promise<void> {
    this.notes.delete(name);
    this.persist();
  }
}

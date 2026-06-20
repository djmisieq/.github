// Wspólne typy dla skarbca (vault) notatek.

/** Pojedyncza notatka. `name` to nazwa bez rozszerzenia .md (służy jako identyfikator linków [[...]]). */
export interface Note {
  /** Nazwa notatki bez rozszerzenia, np. "Pomysły". Używana w linkach [[Pomysły]]. */
  name: string;
  /** Surowa treść Markdown. */
  content: string;
}

/** Wynik analizy treści notatki. */
export interface ParsedNote {
  name: string;
  /** Nazwy notatek, do których prowadzą linki [[...]] z tej notatki. */
  links: string[];
  /** Tagi #tag wykryte w treści (bez znaku #). */
  tags: string[];
}

/** Krawędź grafu: z notatki `source` prowadzi link do `target`. */
export interface GraphEdge {
  source: string;
  target: string;
}

/**
 * Abstrakcja magazynu notatek. Mamy dwie implementacje:
 * - FsVault   – prawdziwy folder na dysku (File System Access API),
 * - MemoryVault – dane w pamięci/localStorage (tryb demo / przeglądarki bez API).
 */
export interface VaultStore {
  /** Czytelna nazwa źródła (np. nazwa folderu). */
  readonly label: string;
  /** Wczytuje wszystkie notatki. */
  list(): Promise<Note[]>;
  /** Zapisuje (tworzy lub nadpisuje) notatkę. */
  save(name: string, content: string): Promise<void>;
  /** Usuwa notatkę. */
  remove(name: string): Promise<void>;
}

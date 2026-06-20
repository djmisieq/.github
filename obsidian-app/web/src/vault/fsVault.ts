import type { Note, VaultStore } from "./types";

/**
 * Magazyn oparty o prawdziwy folder na dysku (File System Access API).
 * To ten sam mechanizm, którego używa Obsidian: skarbiec = folder z plikami .md.
 * Dzięki temu te same pliki może czytać/zapisywać serwer MCP.
 */
export class FsVault implements VaultStore {
  readonly label: string;
  private dir: FileSystemDirectoryHandle;

  constructor(dir: FileSystemDirectoryHandle) {
    this.dir = dir;
    this.label = dir.name;
  }

  /** Czy przeglądarka obsługuje wybór folderu. */
  static isSupported(): boolean {
    return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
  }

  /** Otwiera systemowe okno wyboru folderu i zwraca gotowy magazyn. */
  static async open(): Promise<FsVault> {
    const picker = (window as unknown as {
      showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    const dir = await picker({ mode: "readwrite" });
    return new FsVault(dir);
  }

  async list(): Promise<Note[]> {
    const notes: Note[] = [];
    // @ts-expect-error – iterator wpisów katalogu nie jest jeszcze w standardowych typach TS
    for await (const [name, handle] of this.dir.entries()) {
      if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
        const file = await (handle as FileSystemFileHandle).getFile();
        notes.push({ name: name.replace(/\.md$/i, ""), content: await file.text() });
      }
    }
    return notes.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async save(name: string, content: string): Promise<void> {
    const handle = await this.dir.getFileHandle(`${name}.md`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async remove(name: string): Promise<void> {
    await this.dir.removeEntry(`${name}.md`);
  }
}

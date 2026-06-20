import type { Note, VaultStore } from "./types";

/**
 * Magazyn oparty o prawdziwy folder na dysku (File System Access API).
 * To ten sam mechanizm, którego używa Obsidian: skarbiec = folder z plikami .md.
 * Obsługuje podfoldery — nazwa notatki "Projekty/Plan" to plik Plan.md w podfolderze Projekty.
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

  /** Przechodzi do podkatalogu odpowiadającego segmentom ścieżki (opcjonalnie tworząc go). */
  private async dirForSegments(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let cur = this.dir;
    for (const seg of segments) {
      cur = await cur.getDirectoryHandle(seg, { create });
    }
    return cur;
  }

  /** Rekurencyjnie zbiera wszystkie pliki .md, budując nazwy ze ścieżką (np. "Folder/Notatka"). */
  private async collect(dir: FileSystemDirectoryHandle, prefix: string, out: Note[]): Promise<void> {
    // @ts-expect-error – iterator wpisów katalogu nie jest jeszcze w standardowych typach TS
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push({ name: prefix + name.replace(/\.md$/i, ""), content: await file.text() });
      } else if (handle.kind === "directory") {
        await this.collect(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, out);
      }
    }
  }

  async list(): Promise<Note[]> {
    const notes: Note[] = [];
    await this.collect(this.dir, "", notes);
    return notes.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async save(name: string, content: string): Promise<void> {
    const segments = name.split("/");
    const file = segments.pop()!;
    const dir = await this.dirForSegments(segments, true);
    const handle = await dir.getFileHandle(`${file}.md`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async remove(name: string): Promise<void> {
    const segments = name.split("/");
    const file = segments.pop()!;
    const dir = await this.dirForSegments(segments, false);
    await dir.removeEntry(`${file}.md`);
  }
}

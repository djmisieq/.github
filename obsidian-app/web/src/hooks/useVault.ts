import { useCallback, useEffect, useMemo, useState } from "react";
import type { Note, VaultStore } from "../vault/types";
import { MemoryVault } from "../vault/memoryVault";
import { FsVault } from "../vault/fsVault";

export interface VaultApi {
  store: VaultStore;
  notes: Note[];
  loading: boolean;
  /** Otwiera prawdziwy folder na dysku (jeśli przeglądarka obsługuje). */
  openFolder: () => Promise<void>;
  fsSupported: boolean;
  saveNote: (name: string, content: string) => Promise<void>;
  createNote: (name: string) => Promise<Note>;
  deleteNote: (name: string) => Promise<void>;
  getNote: (name: string) => Note | undefined;
}

export function useVault(): VaultApi {
  const [store, setStore] = useState<VaultStore>(() => new MemoryVault());
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (s: VaultStore) => {
    setLoading(true);
    setNotes(await s.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh(store);
  }, [store, refresh]);

  const openFolder = useCallback(async () => {
    const fs = await FsVault.open();
    setStore(fs);
  }, []);

  const saveNote = useCallback(
    async (name: string, content: string) => {
      await store.save(name, content);
      setNotes((prev) => {
        const idx = prev.findIndex((n) => n.name === name);
        const next = [...prev];
        if (idx === -1) next.push({ name, content });
        else next[idx] = { name, content };
        return next.sort((a, b) => a.name.localeCompare(b.name, "pl"));
      });
    },
    [store],
  );

  const createNote = useCallback(
    async (name: string): Promise<Note> => {
      const existing = notes.find((n) => n.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      const content = `# ${name}\n\n`;
      await saveNote(name, content);
      return { name, content };
    },
    [notes, saveNote],
  );

  const deleteNote = useCallback(
    async (name: string) => {
      await store.remove(name);
      setNotes((prev) => prev.filter((n) => n.name !== name));
    },
    [store],
  );

  const getNote = useCallback(
    (name: string) => notes.find((n) => n.name.toLowerCase() === name.toLowerCase()),
    [notes],
  );

  const fsSupported = useMemo(() => FsVault.isSupported(), []);

  return { store, notes, loading, openFolder, fsSupported, saveNote, createNote, deleteNote, getNote };
}

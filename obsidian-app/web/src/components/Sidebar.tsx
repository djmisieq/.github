import { useMemo, useState } from "react";
import type { Note } from "../vault/types";
import { extractTags } from "../vault/parse";

interface Props {
  notes: Note[];
  current: string | null;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
}

// Drzewo notatek: foldery (z dziećmi) i liście (notatki). Ścieżka po "/".
interface TreeNode {
  name: string; // ostatni segment
  path: string; // pełna ścieżka (dla liści = nazwa notatki)
  children: Map<string, TreeNode>;
  isLeaf: boolean;
}

function buildTree(notes: Note[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), isLeaf: false };
  for (const note of notes) {
    const segments = note.name.split("/");
    let cur = root;
    segments.forEach((seg, i) => {
      const isLeaf = i === segments.length - 1;
      let child = cur.children.get(seg);
      if (!child) {
        child = {
          name: seg,
          path: segments.slice(0, i + 1).join("/"),
          children: new Map(),
          isLeaf,
        };
        cur.children.set(seg, child);
      }
      cur = child;
    });
  }
  return root;
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    // Foldery przed plikami, potem alfabetycznie.
    if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1;
    return a.name.localeCompare(b.name, "pl");
  });
}

/** Lewy panel: drzewo notatek z folderami, tworzenie, filtr po tagach. */
export function Sidebar({ notes, current, onSelect, onCreate, onDelete }: Props) {
  const [newName, setNewName] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of extractTags(n.content)) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "pl"));
  }, [notes]);

  const visible = useMemo(() => {
    if (!activeTag) return notes;
    return notes.filter((n) => extractTags(n.content).includes(activeTag));
  }, [notes, activeTag]);

  const tree = useMemo(() => buildTree(visible), [visible]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  }

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number) {
    if (node.isLeaf) {
      return (
        <li
          key={node.path}
          className={`leaf ${node.path === current ? "active" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => onSelect(node.path)}
        >
          <span className="note-title">📄 {node.name}</span>
          <button
            className="del"
            title="Usuń"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Usunąć notatkę „${node.path}"?`)) onDelete(node.path);
            }}
          >
            🗑
          </button>
        </li>
      );
    }
    const isOpen = !collapsed.has(node.path);
    return (
      <li key={node.path} className="folder-group">
        <div
          className="folder"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggle(node.path)}
        >
          <span>{isOpen ? "▾" : "▸"} 📁 {node.name}</span>
        </div>
        {isOpen && (
          <ul>{sortedChildren(node).map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <aside className="sidebar">
      <div className="new-note">
        <input
          value={newName}
          placeholder="Nowa notatka (Folder/Nazwa)..."
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button onClick={handleCreate} title="Utwórz notatkę">+</button>
      </div>

      {allTags.length > 0 && (
        <div className="tags">
          {activeTag && (
            <button className="tag clear" onClick={() => setActiveTag(null)}>
              ✕ {activeTag}
            </button>
          )}
          {!activeTag &&
            allTags.map((t) => (
              <button key={t} className="tag" onClick={() => setActiveTag(t)}>
                #{t}
              </button>
            ))}
        </div>
      )}

      <ul className="note-list">
        {sortedChildren(tree).map((c) => renderNode(c, 0))}
        {visible.length === 0 && <li className="empty">Brak notatek</li>}
      </ul>
    </aside>
  );
}

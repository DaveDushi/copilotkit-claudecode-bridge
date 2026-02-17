import { useState, useCallback, useEffect } from "react";
import { useCopilotReadable } from "@copilotkit/react-core";

const MGMT_API = "http://localhost:3002";

export interface FileEntry {
  name: string;
  type: "file" | "dir";
  path: string;
}

export function useFileTree() {
  const [tree, setTree] = useState<Map<string, FileEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["."]));
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // Expose selected files to Claude
  useCopilotReadable({
    description: "Files the user selected in the file tree sidebar. Analyze these when the user asks about them.",
    value: selected.length > 0
      ? `Selected files:\n${selected.join("\n")}`
      : "(no files selected in sidebar)",
  });

  const fetchDir = useCallback(async (dirPath: string) => {
    if (tree.has(dirPath) || loading.has(dirPath)) return;
    setLoading((prev) => new Set(prev).add(dirPath));
    try {
      const res = await fetch(`${MGMT_API}/api/files?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) return;
      const data = await res.json();
      setTree((prev) => {
        const next = new Map(prev);
        next.set(dirPath, data.entries ?? []);
        return next;
      });
    } catch {
      // silently ignore
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, [tree, loading]);

  const toggleExpand = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        // Fetch if not loaded
        if (!tree.has(dirPath)) fetchDir(dirPath);
      }
      return next;
    });
  }, [tree, fetchDir]);

  const toggleSelect = useCallback((filePath: string) => {
    setSelected((prev) =>
      prev.includes(filePath)
        ? prev.filter((f) => f !== filePath)
        : [...prev, filePath],
    );
  }, []);

  const clearSelection = useCallback(() => setSelected([]), []);

  // Load root on mount
  useEffect(() => {
    fetchDir(".");
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    tree,
    expanded,
    selected,
    loading,
    toggleExpand,
    toggleSelect,
    clearSelection,
    fetchDir,
  };
}

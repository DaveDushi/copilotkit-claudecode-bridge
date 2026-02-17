import React, { useState, useCallback } from "react";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import type { CanvasComponent } from "../types";

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  timestamp: number;
  components: CanvasComponent[];
  selectedFiles: string[];
}

const STORAGE_KEY = "file-analysis-studio-snapshots";

function loadSnapshots(): WorkspaceSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots: WorkspaceSnapshot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
}

export function useStatePersistence(
  components: CanvasComponent[],
  setComponents: React.Dispatch<React.SetStateAction<CanvasComponent[]>>,
) {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>(loadSnapshots);

  const handleSave = useCallback((name: string) => {
    const snapshot: WorkspaceSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      timestamp: Date.now(),
      components: [...components],
      selectedFiles: [],
    };
    setSnapshots((prev) => {
      const updated = [snapshot, ...prev];
      saveSnapshots(updated);
      return updated;
    });
  }, [components]);

  const handleLoad = useCallback((id: string) => {
    const snap = snapshots.find((s) => s.id === id);
    if (snap) {
      setComponents(snap.components.map((c) => ({ ...c, timestamp: Date.now() })));
    }
  }, [snapshots, setComponents]);

  const handleDelete = useCallback((id: string) => {
    setSnapshots((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveSnapshots(updated);
      return updated;
    });
  }, []);

  // Expose snapshots to Claude
  useCopilotReadable({
    description: "Saved workspace snapshots the user can restore.",
    value: snapshots.length > 0
      ? snapshots.map((s) => `- "${s.name}" (${s.components.length} panels, ${new Date(s.timestamp).toLocaleString()})`).join("\n")
      : "(no saved snapshots)",
  });

  // Claude can save a snapshot
  useCopilotAction({
    name: "saveSnapshot",
    description: "Save the current canvas state as a named snapshot for later restoration.",
    parameters: [
      { name: "name", type: "string" as const, description: "Name for the snapshot", required: true },
    ],
    handler: async ({ name }: { name: string }) => {
      handleSave(name);
      return `Snapshot "${name}" saved with ${components.length} panel(s).`;
    },
  });

  // Claude can load a snapshot
  useCopilotAction({
    name: "loadSnapshot",
    description: "Load a previously saved workspace snapshot by name.",
    parameters: [
      { name: "name", type: "string" as const, description: "Name of the snapshot to load", required: true },
    ],
    handler: async ({ name }: { name: string }) => {
      const snap = snapshots.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (!snap) return `Snapshot "${name}" not found.`;
      handleLoad(snap.id);
      return `Loaded snapshot "${snap.name}" with ${snap.components.length} panel(s).`;
    },
  });

  return { snapshots, handleSave, handleLoad, handleDelete };
}

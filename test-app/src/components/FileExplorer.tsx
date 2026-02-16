/**
 * FileExplorer — Visual file panel that Claude can populate.
 *
 * When Claude scans folders, searches for files, or creates new ones,
 * it pushes them here via the showFiles action. Files render as cards
 * with type icons — images get thumbnails, code gets syntax labels, etc.
 *
 * This is something a terminal can never do: visually browse files
 * that an AI just discovered for you.
 *
 * Try: "show me what's in my Downloads folder"
 * Try: "find all TypeScript files in this project"
 * Try: "what's the biggest file here?"
 */
import React from "react";
import type { FileEntry } from "../types";

interface FileExplorerProps {
  files: FileEntry[];
  onClear: () => void;
}

const typeIcons: Record<string, string> = {
  directory: "\uD83D\uDCC1",
  image: "\uD83D\uDDBC\uFE0F",
  pdf: "\uD83D\uDCC4",
  code: "\uD83D\uDCDD",
  text: "\uD83D\uDCC3",
  file: "\uD83D\uDCCE",
};

const typeColors: Record<string, string> = {
  directory: "#fff3e0",
  image: "#fce4ec",
  pdf: "#e8eaf6",
  code: "#e0f2f1",
  text: "#f3e5f5",
  file: "#f5f5f5",
};

export function FileExplorer({ files, onClear }: FileExplorerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid #e0e0e0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Files</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#999" }}>
            {files.length > 0 ? `${files.length} file(s)` : "empty"}
          </span>
          {files.length > 0 && (
            <button
              onClick={onClear}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                border: "1px solid #ddd",
                borderRadius: 3,
                background: "#fff",
                cursor: "pointer",
                color: "#888",
              }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {files.length === 0 && (
          <p style={{ textAlign: "center", color: "#bbb", fontSize: 12, marginTop: 20 }}>
            No files yet. Ask Claude to explore a folder.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {files.map((file, i) => (
            <div
              key={`${file.path}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 6,
                background: typeColors[file.type] ?? "#f5f5f5",
                transition: "transform 0.1s",
              }}
              title={file.path}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>
                {typeIcons[file.type] ?? typeIcons.file}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {file.name}
                </div>
                {(file.size || file.preview) && (
                  <div style={{
                    fontSize: 11,
                    color: "#888",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {file.size}{file.size && file.preview ? " — " : ""}{file.preview}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

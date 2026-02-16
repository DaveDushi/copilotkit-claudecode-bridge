import { useRef, useCallback } from "react";
import html2canvas from "html2canvas";
import type { CanvasComponent } from "../types";
import { CANVAS_REGISTRY } from "./dynamic/registry";

interface Props {
  components: CanvasComponent[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "visualization";
}

/** Download a Blob as a file. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

export function DynamicCanvas({ components, onRemove, onClear }: Props) {
  const compRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /** Save a component's rendered body as PNG. */
  const saveAsPng = useCallback(async (comp: CanvasComponent) => {
    const el = compRefs.current[comp.id];
    if (!el) return;

    // For custom HTML, capture the iframe content by grabbing it from srcdoc
    if (comp.type === "custom") {
      const iframe = el.querySelector("iframe") as HTMLIFrameElement | null;
      if (iframe?.contentDocument?.body) {
        try {
          const canvas = await html2canvas(iframe.contentDocument.body, {
            backgroundColor: "#ffffff",
            scale: 2,
          });
          canvas.toBlob((blob) => {
            if (blob) downloadBlob(blob, `${slugify(comp.title)}.png`);
          });
          return;
        } catch {
          // Fall through to parent capture
        }
      }
    }

    try {
      const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${slugify(comp.title)}.png`);
      });
    } catch (err) {
      console.error("Failed to save PNG:", err);
    }
  }, []);

  /** Save custom HTML as a standalone .html file. */
  const saveAsHtml = useCallback((comp: CanvasComponent) => {
    const html = (comp.data as any)?.html ?? "";
    const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${comp.title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.5; color: #333; background: #fff; }
</style>
</head>
<body>
${html}
</body>
</html>`;
    const blob = new Blob([doc], { type: "text/html" });
    downloadBlob(blob, `${slugify(comp.title)}.html`);
  }, []);
  if (components.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        color: "#999",
        padding: 40,
      }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>&#9671;</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#666" }}>Canvas</div>
        <div style={{ fontSize: 13, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
          Ask Claude to analyze data, explore files, or build something.
          Visualizations will appear here automatically.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12, color: "#aaa" }}>
          <span>Try: "Show me the files in this project as a table"</span>
          <span>Try: "Analyze package.json and show key details"</span>
          <span>Try: "Create a progress dashboard for project setup"</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Clear all button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onClear}
          style={{
            fontSize: 11,
            padding: "3px 10px",
            border: "1px solid #ddd",
            borderRadius: 4,
            background: "#fff",
            cursor: "pointer",
            color: "#888",
          }}
        >
          Clear all
        </button>
      </div>

      {/* Components, newest first */}
      {[...components].reverse().map((comp) => {
        const entry = CANVAS_REGISTRY[comp.type];
        if (!entry) return null;
        const Component = entry.component;

        return (
          <div
            key={comp.id}
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid #f0f0f0",
              background: "#fafafa",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{comp.title}</span>
              <span style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 4,
                background: entry.color,
                color: "#333",
                fontWeight: 500,
              }}>
                {entry.label}
              </span>
              <span style={{ fontSize: 10, color: "#bbb" }}>
                {new Date(comp.timestamp).toLocaleTimeString()}
              </span>
              {/* Save buttons */}
              <button
                onClick={() => saveAsPng(comp)}
                style={{
                  background: "none",
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "#666",
                  fontSize: 10,
                  padding: "2px 6px",
                }}
                title="Save as PNG"
              >
                PNG
              </button>
              {comp.type === "custom" && (
                <button
                  onClick={() => saveAsHtml(comp)}
                  style={{
                    background: "none",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    cursor: "pointer",
                    color: "#666",
                    fontSize: 10,
                    padding: "2px 6px",
                  }}
                  title="Save as HTML"
                >
                  HTML
                </button>
              )}
              <button
                onClick={() => onRemove(comp.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#ccc",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "0 2px",
                }}
                title="Remove"
              >
                &times;
              </button>
            </div>

            {/* Component body */}
            <div
              ref={(el) => { compRefs.current[comp.id] = el; }}
              style={{ padding: 12 }}
            >
              <Component data={comp.data} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

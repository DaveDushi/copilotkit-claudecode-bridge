import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { StudioHeader } from "./StudioHeader";
import { StatusBar } from "./StatusBar";
import { FileTreePanel } from "./FileTreePanel";
import { DynamicCanvas } from "./DynamicCanvas";
import { colors } from "../styles";
import type { CanvasComponent } from "../types";
import type { WorkspaceSnapshot } from "../hooks/useStatePersistence";
import type { TodoItem } from "./ToolRenderers";

interface Props {
  components: CanvasComponent[];
  onRemove: (id: string) => void;
  onClear: () => void;
  snapshots: WorkspaceSnapshot[];
  onSaveSnapshot: (name: string) => void;
  onLoadSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onNewSession?: () => void;
  onExpandComponent?: (id: string) => void;
  todos?: TodoItem[];
}

export function StudioLayout({
  components,
  onRemove,
  onClear,
  snapshots,
  onSaveSnapshot,
  onLoadSnapshot,
  onDeleteSnapshot,
  onNewSession,
  onExpandComponent,
  todos,
}: Props) {
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      background: colors.bg,
    }}>
      <StudioHeader componentCount={components.length} onNewSession={onNewSession} todos={todos} />

      <PanelGroup direction="horizontal" style={{ flex: 1, minHeight: 0 }}>
        {/* File Tree Panel */}
        <Panel defaultSize={16} minSize={10} maxSize={28}>
          <FileTreePanel />
        </Panel>

        <PanelResizeHandle style={{
          width: 1,
          background: colors.border,
          cursor: "col-resize",
          position: "relative",
        }}>
          {/* Invisible wider hit area */}
          <div style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: -3,
            right: -3,
          }} />
        </PanelResizeHandle>

        {/* Canvas Panel */}
        <Panel defaultSize={84} style={{ overflow: "auto" }}>
          <DynamicCanvas
            components={components}
            onRemove={onRemove}
            onClear={onClear}
            onExpand={onExpandComponent}
          />
        </Panel>
      </PanelGroup>

      <StatusBar
        snapshots={snapshots}
        onSave={onSaveSnapshot}
        onLoad={onLoadSnapshot}
        onDelete={onDeleteSnapshot}
      />
    </div>
  );
}

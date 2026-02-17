import { useFileTree, type FileEntry } from "../hooks/useFileTree";
import { colors, spacing, typography, transitions } from "../styles";

const FILE_ICONS: Record<string, string> = {
  dir: "\uD83D\uDCC1",     // folder
  ts: "\uD83D\uDCD8",      // blue book
  tsx: "\uD83D\uDCD8",
  js: "\uD83D\uDCD9",      // orange book
  jsx: "\uD83D\uDCD9",
  json: "{ }",
  css: "\uD83C\uDFA8",     // palette
  md: "\uD83D\uDCDD",      // memo
  csv: "\uD83D\uDCCA",     // chart
  html: "\uD83C\uDF10",    // globe
  py: "\uD83D\uDC0D",      // snake
  default: "\uD83D\uDCC4", // page
};

function getIcon(entry: FileEntry): string {
  if (entry.type === "dir") return FILE_ICONS.dir;
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? FILE_ICONS.default;
}

export function FileTreePanel() {
  const { tree, expanded, selected, loading, toggleExpand, toggleSelect, clearSelection } = useFileTree();

  const rootEntries = tree.get(".") ?? [];
  const isLoading = loading.has(".");

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: colors.surface,
      borderRight: `1px solid ${colors.borderLight}`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.borderLight}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          color: colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          Files
        </span>
        {selected.length > 0 && (
          <button
            onClick={clearSelection}
            style={{
              fontSize: 10,
              color: colors.textMuted,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "1px 4px",
            }}
          >
            Clear ({selected.length})
          </button>
        )}
      </div>

      {/* Tree */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        padding: `${spacing.sm}px 0`,
      }}>
        {isLoading ? (
          <div style={{
            padding: spacing.xl,
            textAlign: "center",
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
          }}>
            <span className="pulse">Loading files...</span>
          </div>
        ) : rootEntries.length === 0 ? (
          <div style={{
            padding: spacing.xl,
            textAlign: "center",
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            No files found.
            <br />
            <span style={{ fontSize: typography.sizes.xs }}>
              Select a workspace folder to browse.
            </span>
          </div>
        ) : (
          rootEntries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              tree={tree}
              expanded={expanded}
              selected={selected}
              loading={loading}
              onToggleExpand={toggleExpand}
              onToggleSelect={toggleSelect}
              onDoubleClick={(path) => {
                // Select file on double-click (exposed to Claude via useCopilotReadable)
                if (!selected.includes(path)) toggleSelect(path);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  tree,
  expanded,
  selected,
  loading,
  onToggleExpand,
  onToggleSelect,
  onDoubleClick,
}: {
  entry: FileEntry;
  depth: number;
  tree: Map<string, FileEntry[]>;
  expanded: Set<string>;
  selected: string[];
  loading: Set<string>;
  onToggleExpand: (path: string) => void;
  onToggleSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
}) {
  const isDir = entry.type === "dir";
  const isExpanded = expanded.has(entry.path);
  const isSelected = selected.includes(entry.path);
  const isLoading = loading.has(entry.path);
  const children = isDir ? tree.get(entry.path) ?? [] : [];
  const icon = getIcon(entry);

  return (
    <>
      <div
        onClick={() => {
          if (isDir) onToggleExpand(entry.path);
          else onToggleSelect(entry.path);
        }}
        onDoubleClick={() => {
          if (!isDir) onDoubleClick(entry.path);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.xs,
          padding: `3px ${spacing.md}px 3px ${spacing.md + depth * 16}px`,
          cursor: "pointer",
          fontSize: typography.sizes.sm,
          fontFamily: typography.fontFamily,
          color: isSelected ? colors.accentText : colors.text,
          background: isSelected ? colors.accentLight : "transparent",
          borderLeft: isSelected ? `3px solid ${colors.accent}` : "3px solid transparent",
          transition: transitions.fast,
          userSelect: "none",
          height: 28,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = colors.surfaceHover;
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {/* Expand chevron for dirs */}
        {isDir && (
          <span style={{
            fontSize: 10,
            color: colors.textMuted,
            width: 12,
            textAlign: "center",
            flexShrink: 0,
            transition: transitions.fast,
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}>
            \u25B6
          </span>
        )}
        {!isDir && <span style={{ width: 12, flexShrink: 0 }} />}

        {/* Icon */}
        <span style={{ fontSize: 13, flexShrink: 0, width: 18, textAlign: "center" }}>
          {isLoading ? <span className="spin" style={{ display: "inline-block" }}>\u25E6</span> : icon}
        </span>

        {/* Name */}
        <span style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: isDir ? typography.weights.medium : typography.weights.normal,
        }}>
          {entry.name}
        </span>
      </div>

      {/* Children */}
      {isDir && isExpanded && children.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          tree={tree}
          expanded={expanded}
          selected={selected}
          loading={loading}
          onToggleExpand={onToggleExpand}
          onToggleSelect={onToggleSelect}
          onDoubleClick={onDoubleClick}
        />
      ))}
    </>
  );
}

/**
 * useInteractiveActions — CopilotKit generative UI showcase.
 *
 * Registers interactive actions using renderAndWaitForResponse:
 *   confirmAction   — confirmation dialog (Claude asks before destructive actions)
 *   chooseOption    — multi-option selection card
 *   collectInput    — inline form with typed fields
 *   reviewAndEdit   — editable draft review
 *   showProgress    — live progress tracker (standard render, not renderAndWait)
 */
import React, { useState } from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { colors, spacing, radius, shadows, typography, transitions } from "../styles";

// ═══════════════════════════════════════════════════════════════════
// 1. confirmAction
// ═══════════════════════════════════════════════════════════════════

export function useInteractiveActions() {
  useCopilotAction({
    name: "confirmAction",
    description: "Ask the user to confirm or cancel an action before proceeding. Use this before any destructive or significant operation.",
    parameters: [
      { name: "title", type: "string" as const, description: "What needs confirmation", required: true },
      { name: "description", type: "string" as const, description: "Details about what will happen" },
      { name: "confirmLabel", type: "string" as const, description: "Label for confirm button" },
      { name: "cancelLabel", type: "string" as const, description: "Label for cancel button" },
    ],
    renderAndWaitForResponse: ({ args, status, respond }: any) => (
      <ConfirmCard
        title={args?.title ?? "Confirm Action"}
        description={args?.description}
        confirmLabel={args?.confirmLabel ?? "Confirm"}
        cancelLabel={args?.cancelLabel ?? "Cancel"}
        completed={status === "complete"}
        onConfirm={() => respond?.("User confirmed.")}
        onCancel={() => respond?.("User cancelled.")}
      />
    ),
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. chooseOption
  // ═══════════════════════════════════════════════════════════════

  useCopilotAction({
    name: "chooseOption",
    description: "Present multiple options to the user and wait for their selection. Use when the user needs to make a choice between approaches, items, or actions.",
    parameters: [
      { name: "question", type: "string" as const, description: "The question or prompt to show", required: true },
      { name: "options", type: "string" as const, description: 'JSON array of {label, value, description?} objects', required: true },
      { name: "allowMultiple", type: "boolean" as const, description: "Allow selecting multiple options (default: false)" },
    ],
    renderAndWaitForResponse: ({ args, status, respond }: any) => {
      let options: { label: string; value: string; description?: string }[] = [];
      try { options = JSON.parse(args?.options ?? "[]"); } catch { /* ignore */ }
      return (
        <OptionSelector
          question={args?.question ?? "Select an option"}
          options={options}
          allowMultiple={args?.allowMultiple ?? false}
          completed={status === "complete"}
          onSelect={(selected) => respond?.(`User selected: ${JSON.stringify(selected)}`)}
        />
      );
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. collectInput
  // ═══════════════════════════════════════════════════════════════

  useCopilotAction({
    name: "collectInput",
    description: 'Show an inline form in chat and wait for the user to fill it in. Use when you need structured input from the user (e.g., settings, parameters, listing details).',
    parameters: [
      { name: "title", type: "string" as const, description: "Form title", required: true },
      { name: "fields", type: "string" as const, description: 'JSON array: [{name, label, type: "text"|"number"|"textarea"|"select", placeholder?, options?: string[], required?: boolean}]', required: true },
    ],
    renderAndWaitForResponse: ({ args, status, respond }: any) => {
      let fields: FormField[] = [];
      try { fields = JSON.parse(args?.fields ?? "[]"); } catch { /* ignore */ }
      return (
        <InlineForm
          title={args?.title ?? "Input Required"}
          fields={fields}
          completed={status === "complete"}
          onSubmit={(values) => respond?.(`User submitted form: ${JSON.stringify(values)}`)}
        />
      );
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. reviewAndEdit
  // ═══════════════════════════════════════════════════════════════

  useCopilotAction({
    name: "reviewAndEdit",
    description: "Present draft content for the user to review and edit. The edited version is returned to you. Use for content creation workflows (listings, copy, documents).",
    parameters: [
      { name: "title", type: "string" as const, description: "Title for the review card", required: true },
      { name: "content", type: "string" as const, description: "The draft text content to review", required: true },
      { name: "contentType", type: "string" as const, description: "Type hint: text, listing, code, markdown" },
    ],
    renderAndWaitForResponse: ({ args, status, respond }: any) => (
      <ReviewEditor
        title={args?.title ?? "Review Draft"}
        content={args?.content ?? ""}
        contentType={args?.contentType ?? "text"}
        completed={status === "complete"}
        onApprove={(edited) => respond?.(`User approved with content:\n${edited}`)}
        onRequestChanges={(feedback) => respond?.(`User requested changes: ${feedback}`)}
      />
    ),
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. showProgress (standard render, not renderAndWait)
  // ═══════════════════════════════════════════════════════════════

  useCopilotAction({
    name: "showProgress",
    description: "Show a live progress tracker in chat for a multi-step task. Call this to display task progress visually.",
    parameters: [
      { name: "title", type: "string" as const, description: "Task title", required: true },
      { name: "steps", type: "string" as const, description: 'JSON array: [{label, status: "pending"|"running"|"done"|"error"}]', required: true },
    ],
    handler: async ({ title }: any) => `Completed: ${title}`,
    render: ({ status, args }: any) => {
      let steps: ProgressStep[] = [];
      try { steps = JSON.parse(args?.steps ?? "[]"); } catch { /* ignore */ }
      return (
        <ProgressTracker
          title={args?.title ?? "Progress"}
          steps={steps}
          completed={status === "complete"}
        />
      );
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// Shared Card Wrapper
// ═══════════════════════════════════════════════════════════════════

function InteractiveCard({
  children,
  completed,
}: {
  children: React.ReactNode;
  completed: boolean;
}) {
  return (
    <div
      className="fade-in"
      style={{
        background: colors.surface,
        border: `1px solid ${completed ? colors.border : colors.accent}`,
        borderRadius: radius.lg,
        padding: spacing.lg,
        margin: `${spacing.sm}px 0`,
        boxShadow: completed ? shadows.sm : shadows.md,
        opacity: completed ? 0.75 : 1,
        transition: transitions.normal,
        pointerEvents: completed ? "none" : "auto",
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      marginBottom: spacing.sm,
    }}>
      {children}
    </div>
  );
}

function CardButton({
  children,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const bg = variant === "primary" ? colors.accent
    : variant === "danger" ? colors.error
    : "transparent";
  const fg = variant === "secondary" ? colors.textSecondary : "#fff";
  const border = variant === "secondary" ? `1px solid ${colors.border}` : "none";

  return (
    <button
      onClick={onClick}
      style={{
        height: 36,
        padding: `0 ${spacing.lg}px`,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
        fontFamily: typography.fontFamily,
        background: bg,
        color: fg,
        border,
        borderRadius: radius.md,
        cursor: "pointer",
        transition: transitions.fast,
      }}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 1. ConfirmCard
// ═══════════════════════════════════════════════════════════════════

function ConfirmCard({
  title,
  description,
  confirmLabel,
  cancelLabel,
  completed,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  completed: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <InteractiveCard completed={completed}>
      <CardTitle>{title}</CardTitle>
      {description && (
        <div style={{
          fontSize: typography.sizes.md,
          color: colors.textSecondary,
          marginBottom: spacing.md,
          lineHeight: 1.5,
        }}>
          {description}
        </div>
      )}
      <div style={{ display: "flex", gap: spacing.sm, justifyContent: "flex-end" }}>
        <CardButton onClick={onCancel} variant="secondary">{cancelLabel}</CardButton>
        <CardButton onClick={onConfirm} variant="primary">{confirmLabel}</CardButton>
      </div>
    </InteractiveCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. OptionSelector
// ═══════════════════════════════════════════════════════════════════

function OptionSelector({
  question,
  options,
  allowMultiple,
  completed,
  onSelect,
}: {
  question: string;
  options: { label: string; value: string; description?: string }[];
  allowMultiple: boolean;
  completed: boolean;
  onSelect: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allowMultiple) {
        if (next.has(value)) next.delete(value);
        else next.add(value);
      } else {
        next.clear();
        next.add(value);
      }
      return next;
    });
  };

  return (
    <InteractiveCard completed={completed}>
      <CardTitle>{question}</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm, marginBottom: spacing.md }}>
        {options.map((opt) => {
          const isSelected = selected.has(opt.value);
          return (
            <div
              key={opt.value}
              onClick={() => toggle(opt.value)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.md,
                border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                background: isSelected ? colors.accentLight : colors.surface,
                cursor: "pointer",
                transition: transitions.fast,
              }}
            >
              {/* Radio/Check indicator */}
              <div style={{
                width: 18,
                height: 18,
                borderRadius: allowMultiple ? 4 : 9,
                border: `2px solid ${isSelected ? colors.accent : colors.border}`,
                background: isSelected ? colors.accent : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}>
                {isSelected && (
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>\u2713</span>
                )}
              </div>
              <div>
                <div style={{
                  fontSize: typography.sizes.md,
                  fontWeight: typography.weights.medium,
                  color: isSelected ? colors.accentText : colors.text,
                }}>
                  {opt.label}
                </div>
                {opt.description && (
                  <div style={{
                    fontSize: typography.sizes.sm,
                    color: colors.textSecondary,
                    marginTop: 2,
                  }}>
                    {opt.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <CardButton
          onClick={() => onSelect(Array.from(selected))}
          variant="primary"
        >
          {allowMultiple ? `Select (${selected.size})` : "Confirm"}
        </CardButton>
      </div>
    </InteractiveCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3. InlineForm
// ═══════════════════════════════════════════════════════════════════

interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

function InlineForm({
  title,
  fields,
  completed,
  onSubmit,
}: {
  title: string;
  fields: FormField[];
  completed: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((f) => { initial[f.name] = ""; });
    return initial;
  });

  const update = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    outline: "none",
    background: colors.surface,
    color: colors.text,
    transition: transitions.fast,
  };

  return (
    <InteractiveCard completed={completed}>
      <CardTitle>{title}</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, marginBottom: spacing.lg }}>
        {fields.map((field) => (
          <div key={field.name}>
            <label style={{
              display: "block",
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary,
              marginBottom: spacing.xs,
            }}>
              {field.label}
              {field.required && <span style={{ color: colors.error, marginLeft: 2 }}>*</span>}
            </label>
            {field.type === "textarea" ? (
              <textarea
                value={values[field.name] ?? ""}
                onChange={(e) => update(field.name, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
              />
            ) : field.type === "select" ? (
              <select
                value={values[field.name] ?? ""}
                onChange={(e) => update(field.name, e.target.value)}
                style={inputStyle}
              >
                <option value="">Select...</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                value={values[field.name] ?? ""}
                onChange={(e) => update(field.name, e.target.value)}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <CardButton onClick={() => onSubmit(values)} variant="primary">Submit</CardButton>
      </div>
    </InteractiveCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4. ReviewEditor
// ═══════════════════════════════════════════════════════════════════

function ReviewEditor({
  title,
  content,
  contentType,
  completed,
  onApprove,
  onRequestChanges,
}: {
  title: string;
  content: string;
  contentType: string;
  completed: boolean;
  onApprove: (edited: string) => void;
  onRequestChanges: (feedback: string) => void;
}) {
  const [editedContent, setEditedContent] = useState(content);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const isMono = contentType === "code";

  return (
    <InteractiveCard completed={completed}>
      <CardTitle>{title}</CardTitle>
      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        marginBottom: spacing.sm,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        {contentType}
      </div>
      <textarea
        value={editedContent}
        onChange={(e) => setEditedContent(e.target.value)}
        style={{
          width: "100%",
          minHeight: 120,
          padding: spacing.md,
          fontSize: typography.sizes.md,
          fontFamily: isMono ? typography.mono : typography.fontFamily,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          outline: "none",
          background: colors.bg,
          color: colors.text,
          resize: "vertical",
          lineHeight: 1.6,
          marginBottom: spacing.md,
        }}
      />
      {showFeedback && (
        <div style={{ marginBottom: spacing.md }}>
          <input
            autoFocus
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && feedback.trim()) {
                onRequestChanges(feedback);
              }
            }}
            placeholder="What should be changed?"
            style={{
              width: "100%",
              padding: `${spacing.sm}px ${spacing.md}px`,
              fontSize: typography.sizes.md,
              fontFamily: typography.fontFamily,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              outline: "none",
            }}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: spacing.sm, justifyContent: "flex-end" }}>
        {!showFeedback ? (
          <CardButton onClick={() => setShowFeedback(true)} variant="secondary">
            Request Changes
          </CardButton>
        ) : (
          <CardButton
            onClick={() => { if (feedback.trim()) onRequestChanges(feedback); }}
            variant="secondary"
          >
            Send Feedback
          </CardButton>
        )}
        <CardButton onClick={() => onApprove(editedContent)} variant="primary">
          Approve
        </CardButton>
      </div>
    </InteractiveCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 5. ProgressTracker
// ═══════════════════════════════════════════════════════════════════

interface ProgressStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

function ProgressTracker({
  title,
  steps,
  completed,
}: {
  title: string;
  steps: ProgressStep[];
  completed: boolean;
}) {
  const statusIcon = (s: ProgressStep["status"]) => {
    switch (s) {
      case "done": return <span style={{ color: colors.success }}>&#10003;</span>;
      case "running": return <span className="pulse" style={{ color: colors.accent }}>&#9679;</span>;
      case "error": return <span style={{ color: colors.error }}>&#10007;</span>;
      default: return <span style={{ color: colors.textMuted }}>&#9675;</span>;
    }
  };

  return (
    <InteractiveCard completed={completed}>
      <CardTitle>{title}</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              padding: `${spacing.xs}px 0`,
              fontSize: typography.sizes.md,
              color: step.status === "pending" ? colors.textMuted : colors.text,
            }}
          >
            <span style={{ width: 18, textAlign: "center", fontSize: 14 }}>
              {statusIcon(step.status)}
            </span>
            <span style={{
              fontWeight: step.status === "running" ? typography.weights.semibold : typography.weights.normal,
            }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </InteractiveCard>
  );
}

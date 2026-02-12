import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { useClaudeBridge } from "copilotkit-claude-bridge/react";
import "@copilotkit/react-ui/styles.css";

export default function App() {
  const { runtimeUrl, agents } = useClaudeBridge({
    runtimeUrl: "http://localhost:3000",
  });

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e0e0e0",
          background: "#f8f9fa",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px" }}>
          CopilotKit + Claude Bridge Test
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#666" }}>
          Talking to Claude Code CLI via the AG-UI bridge
        </p>
      </header>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <CopilotKit
          runtimeUrl={runtimeUrl}
          agent="default"
          agents__unsafe_dev_only={agents}
        >
          <CopilotChat
            instructions="You are a helpful coding assistant powered by Claude Code."
            labels={{
              title: "Claude Code Agent",
              initial: "Hi! I'm Claude Code. Ask me anything about your codebase.",
            }}
          />
        </CopilotKit>
      </div>
    </div>
  );
}

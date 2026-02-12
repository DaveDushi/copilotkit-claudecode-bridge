import { useMemo } from "react";

/**
 * React hook for wiring CopilotKit to the Claude bridge server.
 *
 * Creates an HttpAgent from @ag-ui/client pointing at the bridge's
 * AG-UI endpoint. Returns props ready to spread into <CopilotKit>.
 *
 * Usage:
 * ```tsx
 * import { useClaudeBridge } from "copilotkit-claude-bridge/react";
 *
 * const { runtimeUrl, agents } = useClaudeBridge({
 *   runtimeUrl: "http://localhost:3000",
 * });
 *
 * <CopilotKit
 *   runtimeUrl={runtimeUrl}
 *   agent="default"
 *   agents__unsafe_dev_only={agents}
 * >
 *   <CopilotChat />
 * </CopilotKit>
 * ```
 */
export function useClaudeBridge(config: {
  runtimeUrl: string;
  agentId?: string;
}) {
  const agentId = config.agentId ?? "default";

  const agents = useMemo(() => {
    // Dynamic import to avoid hard dependency on @ag-ui/client
    // Users must install it as a peer dependency
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { HttpAgent } = require("@ag-ui/client");
      return {
        [agentId]: new HttpAgent({
          url: `${config.runtimeUrl}/agent/${agentId}/run`,
          agentId,
          description: "Claude Code AI agent",
        }),
      } as Record<string, unknown>;
    } catch {
      console.warn(
        "[@copilotkit-claude-bridge] @ag-ui/client not found. " +
        "Install it to use the useClaudeBridge hook: npm install @ag-ui/client",
      );
      return undefined;
    }
  }, [config.runtimeUrl, agentId]);

  return { runtimeUrl: config.runtimeUrl, agents, agentId };
}

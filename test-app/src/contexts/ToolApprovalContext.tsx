import { createContext, useContext } from "react";
import type { ToolApprovalRequest } from "../hooks/useToolApproval";

interface ToolApprovalContextValue {
  pending: ToolApprovalRequest[];
  approve: (req: ToolApprovalRequest) => void;
  deny: (req: ToolApprovalRequest, reason?: string) => void;
  approveAll: () => void;
}

export const ToolApprovalContext = createContext<ToolApprovalContextValue>({
  pending: [],
  approve: () => {},
  deny: () => {},
  approveAll: () => {},
});

export const useToolApprovalContext = () => useContext(ToolApprovalContext);

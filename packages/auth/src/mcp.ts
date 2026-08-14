import { apiUrl } from "./env";
import type { WorkspaceRole } from "./organization";

export const MCP_KEY_PREFIX = "crm_mcp_";

export function canManageMcpKeys(role: WorkspaceRole | null): boolean {
	return role === "owner";
}

export function mcpEndpointUrl(): string {
	return `${apiUrl}/api/mcp`;
}

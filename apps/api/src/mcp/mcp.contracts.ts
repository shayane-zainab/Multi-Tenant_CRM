import { z } from "zod";

export const createMcpKeyInput = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Give the key a name, so you know what to revoke later.")
		.max(32, "That name is too long — 32 characters at most."),
});

export type CreateMcpKeyInput = z.infer<typeof createMcpKeyInput>;

export const revokeMcpKeyInput = z.object({
	keyId: z.string().min(1),
});

export type RevokeMcpKeyInput = z.infer<typeof revokeMcpKeyInput>;

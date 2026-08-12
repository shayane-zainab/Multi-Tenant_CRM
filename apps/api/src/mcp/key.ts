import type { Request } from "express";

const BEARER = /^Bearer\s+(.+)$/i;

export function readKey(req: Pick<Request, "headers">): string | null {
	const header = req.headers.authorization;

	if (typeof header === "string") {
		const match = BEARER.exec(header.trim());
		if (match?.[1]) return match[1].trim();
	}

	const apiKeyHeader = req.headers["x-api-key"];

	if (typeof apiKeyHeader === "string" && apiKeyHeader.trim().length > 0) {
		return apiKeyHeader.trim();
	}

	return null;
}

export function createdByUserId(metadata: unknown): string | null {
	const parsed =
		typeof metadata === "string" ? safeParse(metadata) : (metadata ?? null);

	if (typeof parsed !== "object" || parsed === null) return null;

	const value = (parsed as Record<string, unknown>).createdByUserId;

	return typeof value === "string" && value.length > 0 ? value : null;
}

function safeParse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

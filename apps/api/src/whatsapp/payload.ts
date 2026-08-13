import { MAX_BODY_CHARS } from "./whatsapp.constants";

export type ParsedDirection = "INBOUND" | "OUTBOUND";

export type ParsedMessage = {
	waMessageId: string;
	waId: string;
	fromWaId: string;
	direction: ParsedDirection;
	kind: string;
	body: string | null;
	caption: string | null;
	mediaId: string | null;
	mediaMime: string | null;
	sentAt: Date;
};

export type ParsedStatus = {
	waMessageId: string;
	waId: string;
	status: "SENT" | "DELIVERED" | "READ" | "FAILED";
	at: Date;
	failedCode: number | null;
	failedTitle: string | null;
};

export type ParsedChange = {
	phoneNumberId: string;
	displayPhone: string | null;
	wabaId: string | null;
	profileNames: Record<string, string>;
	messages: ParsedMessage[];
	statuses: ParsedStatus[];
};

const MEDIA_KINDS = ["image", "video", "audio", "document", "sticker"] as const;

const STATUSES: Record<string, ParsedStatus["status"]> = {
	sent: "SENT",
	delivered: "DELIVERED",
	read: "READ",
	failed: "FAILED",
};

export function parseWebhook(payload: unknown): ParsedChange[] {
	const root = asRecord(payload);
	if (!root) return [];
	if (root.object !== "whatsapp_business_account") return [];

	const changes: ParsedChange[] = [];

	for (const entry of asArray(root.entry)) {
		const entryRecord = asRecord(entry);
		if (!entryRecord) continue;

		const wabaId = asString(entryRecord.id);

		for (const change of asArray(entryRecord.changes)) {
			const parsed = parseChange(change, wabaId);
			if (parsed) changes.push(parsed);
		}
	}

	return changes;
}

function parseChange(
	change: unknown,
	wabaId: string | null,
): ParsedChange | null {
	const record = asRecord(change);
	if (!record) return null;

	const field = asString(record.field);
	if (field !== "messages" && field !== "message_echoes") return null;

	const value = asRecord(record.value);
	if (!value) return null;

	const metadata = asRecord(value.metadata);
	const phoneNumberId = asString(metadata?.phone_number_id);
	if (!phoneNumberId) return null;

	const profileNames: Record<string, string> = {};
	for (const contact of asArray(value.contacts)) {
		const contactRecord = asRecord(contact);
		const waId = asString(contactRecord?.wa_id);
		const name = asString(asRecord(contactRecord?.profile)?.name);
		if (waId && name) profileNames[waId] = name;
	}

	const messages: ParsedMessage[] = [];

	for (const message of asArray(value.messages)) {
		const parsed = parseMessage(message, "INBOUND");
		if (parsed) messages.push(parsed);
	}

	for (const echo of asArray(value.message_echoes)) {
		const parsed = parseMessage(echo, "OUTBOUND");
		if (parsed) messages.push(parsed);
	}

	const statuses: ParsedStatus[] = [];
	for (const status of asArray(value.statuses)) {
		const parsed = parseStatus(status);
		if (parsed) statuses.push(parsed);
	}

	if (messages.length === 0 && statuses.length === 0) return null;

	return {
		phoneNumberId,
		displayPhone: asString(metadata?.display_phone_number),
		wabaId,
		profileNames,
		messages,
		statuses,
	};
}

function parseMessage(
	message: unknown,
	direction: ParsedDirection,
): ParsedMessage | null {
	const record = asRecord(message);
	if (!record) return null;

	const waMessageId = asString(record.id);
	const from = asString(record.from);
	if (!waMessageId || !from) return null;

	const to = asString(record.to);
	const waId = direction === "OUTBOUND" ? (to ?? from) : from;

	const kind = asString(record.type) ?? "unknown";
	const media = MEDIA_KINDS.find((candidate) => candidate === kind);
	const mediaRecord = media ? asRecord(record[media]) : null;

	return {
		waMessageId,
		waId,
		fromWaId: from,
		direction,
		kind,
		body: clamp(readBody(record, kind)),
		caption: clamp(asString(mediaRecord?.caption)),
		mediaId: asString(mediaRecord?.id),
		mediaMime: asString(mediaRecord?.mime_type),
		sentAt: readTimestamp(record.timestamp),
	};
}

function readBody(
	record: Record<string, unknown>,
	kind: string,
): string | null {
	if (kind === "text") return asString(asRecord(record.text)?.body);

	if (kind === "button") return asString(asRecord(record.button)?.text);

	if (kind === "reaction") return asString(asRecord(record.reaction)?.emoji);

	if (kind === "location") {
		const location = asRecord(record.location);
		const name = asString(location?.name);
		const address = asString(location?.address);
		const latitude = location?.latitude;
		const longitude = location?.longitude;

		if (name || address) return [name, address].filter(Boolean).join(", ");
		if (typeof latitude === "number" && typeof longitude === "number") {
			return `${latitude}, ${longitude}`;
		}

		return null;
	}

	if (kind === "interactive") {
		const interactive = asRecord(record.interactive);
		return (
			asString(asRecord(interactive?.button_reply)?.title) ??
			asString(asRecord(interactive?.list_reply)?.title)
		);
	}

	return null;
}

function parseStatus(status: unknown): ParsedStatus | null {
	const record = asRecord(status);
	if (!record) return null;

	const waMessageId = asString(record.id);
	const waId = asString(record.recipient_id);
	const mapped = STATUSES[asString(record.status) ?? ""];

	if (!waMessageId || !waId || !mapped) return null;

	const error = asRecord(asArray(record.errors)[0]);

	return {
		waMessageId,
		waId,
		status: mapped,
		at: readTimestamp(record.timestamp),
		failedCode: typeof error?.code === "number" ? error.code : null,
		failedTitle: asString(error?.title),
	};
}

function readTimestamp(value: unknown): Date {
	const seconds =
		typeof value === "string" ? Number.parseInt(value, 10) : Number(value);

	if (!Number.isFinite(seconds) || seconds <= 0) return new Date();

	return new Date(seconds * 1000);
}

function clamp(value: string | null): string | null {
	if (value === null) return null;

	return value.length <= MAX_BODY_CHARS
		? value
		: value.slice(0, MAX_BODY_CHARS);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

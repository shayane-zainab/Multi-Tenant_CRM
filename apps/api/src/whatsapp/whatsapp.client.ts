import { Injectable, Logger } from "@nestjs/common";
import {
	GRAPH_ORIGIN,
	GRAPH_VERSION,
	SEND_TIMEOUT_MS,
	TEXT_LIMIT,
} from "./whatsapp.constants";

export type SendResult =
	| { ok: true; waMessageId: string }
	| { ok: false; status: number | null; message: string };

@Injectable()
export class WhatsAppClient {
	private readonly logger = new Logger(WhatsAppClient.name);

	async sendText(input: {
		phoneNumberId: string;
		accessToken: string;
		to: string;
		body: string;
	}): Promise<SendResult> {
		const body = input.body.slice(0, TEXT_LIMIT);

		return this.post(input.phoneNumberId, input.accessToken, {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to: input.to,
			type: "text",
			text: { preview_url: false, body },
		});
	}

	private async post(
		phoneNumberId: string,
		accessToken: string,
		payload: Record<string, unknown>,
	): Promise<SendResult> {
		const endpoint = `${GRAPH_ORIGIN}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: "POST",
				headers: {
					authorization: `Bearer ${accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
			});
		} catch (error) {
			return {
				ok: false,
				status: null,
				message: error instanceof Error ? error.message : String(error),
			};
		}

		const parsed: unknown = await response.json().catch(() => null);
		const record =
			typeof parsed === "object" && parsed !== null
				? (parsed as Record<string, unknown>)
				: null;

		if (!response.ok) {
			const error =
				typeof record?.error === "object" && record.error !== null
					? (record.error as Record<string, unknown>)
					: null;

			const message =
				typeof error?.message === "string"
					? error.message
					: `WhatsApp refused the message (${response.status})`;

			this.logger.warn({
				message: "WhatsApp send failed",
				status: response.status,
				phoneNumberId,
			});

			return { ok: false, status: response.status, message };
		}

		const messages = Array.isArray(record?.messages) ? record.messages : [];
		const first =
			typeof messages[0] === "object" && messages[0] !== null
				? (messages[0] as Record<string, unknown>)
				: null;

		const waMessageId = first?.id;

		if (typeof waMessageId !== "string") {
			return {
				ok: false,
				status: response.status,
				message: "WhatsApp accepted the message but returned no id.",
			};
		}

		return { ok: true, waMessageId };
	}
}

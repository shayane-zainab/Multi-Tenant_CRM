import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	PayloadTooLargeException,
	Post,
	Req,
	ServiceUnavailableException,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";
import { parseWebhook } from "./payload";
import { verifyChallenge, verifySignature } from "./signature";
import { WhatsAppConfig } from "./whatsapp.config";
import { MAX_WEBHOOK_BYTES, SIGNATURE_HEADER } from "./whatsapp.constants";
import { WhatsAppSyncService } from "./whatsapp-sync.service";

@Controller("internal/whatsapp")
export class WhatsAppController {
	private readonly logger = new Logger(WhatsAppController.name);

	constructor(
		private readonly config: WhatsAppConfig,
		private readonly sync: WhatsAppSyncService,
	) {}

	@Get("webhook")
	@AllowAnonymous()
	verify(@Req() request: Request): string {
		const token = this.config.verification();

		if (!token) {
			this.logger.error({
				message:
					"WHATSAPP_VERIFY_TOKEN is not set — refusing the webhook handshake.",
			});
			throw new ServiceUnavailableException("WhatsApp is not configured.");
		}

		const challenge = verifyChallenge(
			request.query as Record<string, unknown>,
			token,
		);

		if (challenge === null) throw new ForbiddenException();

		this.logger.log({ message: "WhatsApp webhook verified" });

		return challenge;
	}

	@Post("webhook")
	@AllowAnonymous()
	async receive(
		@Req() request: Request,
		@Headers(SIGNATURE_HEADER) signature?: string,
	): Promise<{ received: true }> {
		const secret = this.config.secret();

		if (!secret) {
			this.logger.error({
				message: "WHATSAPP_APP_SECRET is not set — refusing the webhook.",
			});
			throw new ServiceUnavailableException("WhatsApp is not configured.");
		}

		const body = await readRawBody(request);

		if (!verifySignature(body, signature, secret)) {
			this.logger.warn({
				message: "Rejected a WhatsApp webhook whose signature did not verify",
			});
			throw new ForbiddenException();
		}

		let payload: unknown;
		try {
			payload = JSON.parse(body.toString("utf8"));
		} catch {
			return { received: true };
		}

		const changes = parseWebhook(payload);
		if (changes.length === 0) return { received: true };

		try {
			const { stored } = await this.sync.ingest(changes);

			if (stored > 0) {
				this.logger.log({ message: "WhatsApp messages stored", stored });
			}
		} catch (error) {
			this.logger.error(
				{ message: "Could not store a WhatsApp webhook — Meta will retry" },
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}

		return { received: true };
	}
}

async function readRawBody(request: Request): Promise<Buffer> {
	if (Buffer.isBuffer(request.body)) return request.body;

	const chunks: Buffer[] = [];
	let size = 0;

	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
		size += buffer.length;

		if (size > MAX_WEBHOOK_BYTES) {
			throw new PayloadTooLargeException();
		}

		chunks.push(buffer);
	}

	return Buffer.concat(chunks);
}

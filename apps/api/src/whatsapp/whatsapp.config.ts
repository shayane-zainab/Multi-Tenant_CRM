import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";

@Injectable()
export class WhatsAppConfig {
	private readonly verifyToken: string | undefined;
	private readonly appSecret: string | undefined;
	private readonly accessToken: string | undefined;

	constructor(config: ConfigService<EnvironmentVariables, true>) {
		this.verifyToken = trimmed(
			config.get("WHATSAPP_VERIFY_TOKEN", { infer: true }),
		);
		this.appSecret = trimmed(
			config.get("WHATSAPP_APP_SECRET", { infer: true }),
		);
		this.accessToken = trimmed(
			config.get("WHATSAPP_ACCESS_TOKEN", { infer: true }),
		);
	}

	get configured(): boolean {
		return this.verifyToken !== undefined && this.appSecret !== undefined;
	}

	get canSend(): boolean {
		return this.accessToken !== undefined;
	}

	verification(): string | undefined {
		return this.verifyToken;
	}

	secret(): string | undefined {
		return this.appSecret;
	}

	fallbackToken(): string | undefined {
		return this.accessToken;
	}
}

function trimmed(value: string | undefined): string | undefined {
	const text = value?.trim();
	return text ? text : undefined;
}

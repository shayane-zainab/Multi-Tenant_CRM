import { auth } from "@crm/auth";
import type { Db } from "@crm/db";
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { InjectDatabase } from "../database/database.constants";
import { createdByUserId, readKey } from "./key";

export interface McpIdentity {
	organizationId: string;
	userId: string;
	keyId: string;
}

@Injectable()
export class McpIdentityService {
	private readonly logger = new Logger(McpIdentityService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async resolve(req: Request): Promise<McpIdentity> {
		const presented = readKey(req);

		if (!presented) {
			throw new UnauthorizedException(
				"Send the workspace key as `Authorization: Bearer <key>`.",
			);
		}

		const result = await auth.api.verifyApiKey({ body: { key: presented } });

		if (!result.valid || !result.key) {
			throw new UnauthorizedException(
				result.error?.message ?? "That key is not valid.",
			);
		}

		const organizationId = result.key.referenceId;
		const userId = createdByUserId(result.key.metadata);

		if (!userId) {
			throw new UnauthorizedException(
				"That key has no author on it. Revoke it and make a new one.",
			);
		}

		const member = await this.db.member.findUnique({
			where: { organizationId_userId: { organizationId, userId } },
			select: { id: true },
		});

		if (!member) {
			this.logger.warn({
				message: "MCP key presented by a non-member",
				organizationId,
				keyId: result.key.id,
			});

			throw new UnauthorizedException(
				"The person this key belongs to is no longer in the workspace.",
			);
		}

		return { organizationId, userId, keyId: result.key.id };
	}
}

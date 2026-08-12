import {
	auth,
	canManageMcpKeys,
	isWorkspaceRole,
	mcpEndpointUrl,
	type WorkspaceRole,
} from "@crm/auth";
import type { Db } from "@crm/db";
import {
	ForbiddenException,
	HttpException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { APIError } from "better-auth/api";
import { InjectDatabase } from "../database/database.constants";
import { createdByUserId } from "./key";
import type { CreateMcpKeyInput, RevokeMcpKeyInput } from "./mcp.contracts";

export interface McpKey {
	id: string;
	name: string | null;
	start: string | null;
	createdByName: string | null;
	lastRequest: string | null;
	createdAt: string;
}

export interface McpKeySettings {
	canManage: boolean;
	endpoint: string;
	keys: McpKey[];
}

export interface CreatedMcpKey {
	key: McpKey;
	secret: string;
	endpoint: string;
}

const STATUS_BY_CODE: Record<string, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	TOO_MANY_REQUESTS: 429,
};

@Injectable()
export class McpKeysService {
	private readonly logger = new Logger(McpKeysService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async settings(
		organizationId: string,
		userId: string,
	): Promise<McpKeySettings> {
		const [role, keys] = await Promise.all([
			this.roleOf(organizationId, userId),
			this.list(organizationId),
		]);

		return {
			canManage: canManageMcpKeys(role),
			endpoint: mcpEndpointUrl(),
			keys,
		};
	}

	async create(
		organizationId: string,
		userId: string,
		headers: Headers,
		input: CreateMcpKeyInput,
	): Promise<CreatedMcpKey> {
		await this.requireOwner(organizationId, userId);

		const created = await this.call(() =>
			auth.api.createApiKey({
				headers,
				body: {
					name: input.name,
					organizationId,
					userId,
					metadata: { createdByUserId: userId },
				},
			}),
		);

		this.logger.log({
			message: "MCP key created",
			organizationId,
			userId,
			keyId: created.id,
		});

		return {
			key: {
				id: created.id,
				name: created.name,
				start: created.start,
				createdByName: await this.nameOf(userId),
				lastRequest: null,
				createdAt: created.createdAt.toISOString(),
			},
			secret: created.key,
			endpoint: mcpEndpointUrl(),
		};
	}

	async revoke(
		organizationId: string,
		userId: string,
		headers: Headers,
		input: RevokeMcpKeyInput,
	): Promise<{ keyId: string }> {
		await this.requireOwner(organizationId, userId);

		const row = await this.db.apikey.findUnique({
			where: { id: input.keyId },
			select: { referenceId: true },
		});

		if (!row || row.referenceId !== organizationId) {
			throw new NotFoundException("That key does not exist any more.");
		}

		await this.call(() =>
			auth.api.deleteApiKey({ headers, body: { keyId: input.keyId } }),
		);

		this.logger.log({
			message: "MCP key revoked",
			organizationId,
			userId,
			keyId: input.keyId,
		});

		return { keyId: input.keyId };
	}

	private async list(organizationId: string): Promise<McpKey[]> {
		const rows = await this.db.apikey.findMany({
			where: { referenceId: organizationId },
			select: {
				id: true,
				name: true,
				start: true,
				metadata: true,
				lastRequest: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});

		const creators = await this.namesOf(
			rows.map((row) => createdByUserId(row.metadata)),
		);

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			start: row.start,
			createdByName: creators.get(createdByUserId(row.metadata) ?? "") ?? null,
			lastRequest: row.lastRequest?.toISOString() ?? null,
			createdAt: row.createdAt.toISOString(),
		}));
	}

	private async nameOf(userId: string): Promise<string | null> {
		return (await this.namesOf([userId])).get(userId) ?? null;
	}

	private async namesOf(
		userIds: (string | null)[],
	): Promise<Map<string, string>> {
		const ids = [...new Set(userIds.filter((id): id is string => id !== null))];

		if (ids.length === 0) return new Map();

		const users = await this.db.user.findMany({
			where: { id: { in: ids } },
			select: { id: true, name: true, email: true },
		});

		return new Map(users.map((user) => [user.id, user.name || user.email]));
	}

	private async requireOwner(
		organizationId: string,
		userId: string,
	): Promise<void> {
		if (!canManageMcpKeys(await this.roleOf(organizationId, userId))) {
			throw new ForbiddenException(
				"Only the workspace owner can hand out a key to this CRM.",
			);
		}
	}

	private async roleOf(
		organizationId: string,
		userId: string,
	): Promise<WorkspaceRole | null> {
		const member = await this.db.member.findUnique({
			where: { organizationId_userId: { organizationId, userId } },
			select: { role: true },
		});

		if (!member) return null;

		return isWorkspaceRole(member.role) ? member.role : "member";
	}

	private async call<T>(run: () => Promise<T>): Promise<T> {
		try {
			return await run();
		} catch (error) {
			if (error instanceof APIError) {
				const status =
					STATUS_BY_CODE[error.body?.code ?? ""] ?? error.statusCode;

				throw new HttpException(
					error.body?.message ?? "That key could not be saved.",
					typeof status === "number" ? status : 400,
				);
			}

			this.logger.error(
				{ message: "MCP key call failed" },
				error instanceof Error ? error.stack : String(error),
			);

			throw new InternalServerErrorException("Could not reach the key store.");
		}
	}
}

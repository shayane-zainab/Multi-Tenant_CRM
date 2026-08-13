import {
	canManageWhatsApp,
	isWorkspaceRole,
	type WorkspaceRole,
} from "@crm/auth";
import { type Db, WhatsAppSyncStatus } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { displayPhone, normalizePhone } from "./phone";
import { WhatsAppClient } from "./whatsapp.client";
import { WhatsAppConfig } from "./whatsapp.config";
import { WhatsAppSyncService } from "./whatsapp-sync.service";

export type ConnectionStatus = {
	configured: boolean;
	canManage: boolean;
	connections: {
		id: string;
		phoneNumberId: string;
		displayPhone: string | null;
		verifiedName: string | null;
		status: WhatsAppSyncStatus;
		autoCreate: boolean;
		canSend: boolean;
		lastEventAt: string | null;
		lastError: string | null;
		threadCount: number;
	}[];
};

@Injectable()
export class WhatsAppConnectionService {
	private readonly logger = new Logger(WhatsAppConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: WhatsAppConfig,
		private readonly client: WhatsAppClient,
		private readonly sync: WhatsAppSyncService,
		private readonly stamp: ActivityStampService,
	) {}

	async status(
		organizationId: string,
		userId: string,
	): Promise<ConnectionStatus> {
		const rows = await this.db.whatsAppConnection.findMany({
			where: { organizationId },
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				phoneNumberId: true,
				displayPhone: true,
				verifiedName: true,
				status: true,
				autoCreate: true,
				accessToken: true,
				lastEventAt: true,
				lastError: true,
				_count: { select: { threads: true } },
			},
		});

		return {
			configured: this.config.configured,
			canManage: canManageWhatsApp(await this.roleOf(organizationId, userId)),
			connections: rows.map((row) => ({
				id: row.id,
				phoneNumberId: row.phoneNumberId,
				displayPhone: row.displayPhone,
				verifiedName: row.verifiedName,
				status: row.status,
				autoCreate: row.autoCreate,
				canSend: row.accessToken !== null || this.config.canSend,
				lastEventAt: row.lastEventAt?.toISOString() ?? null,
				lastError: row.lastError,
				threadCount: row._count.threads,
			})),
		};
	}

	async connect(
		organizationId: string,
		userId: string,
		input: {
			phoneNumberId: string;
			wabaId?: string;
			displayPhone?: string;
			accessToken?: string;
		},
	): Promise<ConnectionStatus> {
		await this.requireManager(organizationId, userId);

		const taken = await this.db.whatsAppConnection.findUnique({
			where: { phoneNumberId: input.phoneNumberId },
			select: { organizationId: true },
		});

		if (taken && taken.organizationId !== organizationId) {
			throw new BadRequestException(
				"That WhatsApp number is already connected to another workspace.",
			);
		}

		await this.db.whatsAppConnection.upsert({
			where: { phoneNumberId: input.phoneNumberId },
			create: {
				organizationId,
				ownerId: userId,
				phoneNumberId: input.phoneNumberId,
				wabaId: input.wabaId ?? null,
				displayPhone: normalizePhone(input.displayPhone) ?? null,
				accessToken: input.accessToken ?? null,
			},
			update: {
				ownerId: userId,
				wabaId: input.wabaId ?? undefined,
				displayPhone: normalizePhone(input.displayPhone) ?? undefined,
				accessToken: input.accessToken ?? undefined,
				status: WhatsAppSyncStatus.IDLE,
				lastError: null,
			},
		});

		this.logger.log({
			message: "WhatsApp number connected",
			organizationId,
			phoneNumberId: input.phoneNumberId,
		});

		return this.status(organizationId, userId);
	}

	async disconnect(
		organizationId: string,
		userId: string,
		connectionId: string,
	): Promise<ConnectionStatus> {
		await this.requireManager(organizationId, userId);

		const deleted = await this.db.whatsAppConnection.deleteMany({
			where: { id: connectionId, organizationId },
		});

		if (deleted.count === 0)
			throw new NotFoundException("Connection not found.");

		return this.status(organizationId, userId);
	}

	async setAutoCreate(
		organizationId: string,
		userId: string,
		connectionId: string,
		enabled: boolean,
	): Promise<ConnectionStatus> {
		await this.requireManager(organizationId, userId);

		const updated = await this.db.whatsAppConnection.updateMany({
			where: { id: connectionId, organizationId },
			data: { autoCreate: enabled },
		});

		if (updated.count === 0)
			throw new NotFoundException("Connection not found.");

		return this.status(organizationId, userId);
	}

	async purgeSyncedData(
		organizationId: string,
		userId: string,
	): Promise<{ purged: number }> {
		await this.requireManager(organizationId, userId);

		const threads = await this.db.whatsAppThread.findMany({
			where: { organizationId },
			select: { id: true, contactId: true, companyId: true },
		});

		if (threads.length === 0) return { purged: 0 };

		const removed = await this.db.whatsAppThread.deleteMany({
			where: { organizationId },
		});

		for (const thread of threads) {
			await this.stamp.recompute({
				contactId: thread.contactId,
				companyId: thread.companyId,
			});
		}

		this.logger.log({
			message: "WhatsApp synced data purged",
			organizationId,
			purged: removed.count,
		});

		return { purged: removed.count };
	}

	async threads(
		organizationId: string,
		input: { contactId?: string; companyId?: string; take: number },
	) {
		const rows = await this.db.whatsAppThread.findMany({
			where: {
				organizationId,
				...(input.contactId ? { contactId: input.contactId } : {}),
				...(input.companyId ? { companyId: input.companyId } : {}),
			},
			orderBy: { lastMessageAt: "desc" },
			take: input.take,
			select: {
				id: true,
				waId: true,
				profileName: true,
				contactId: true,
				companyId: true,
				lastMessageAt: true,
				messageCount: true,
			},
		});

		return rows.map((row) => ({
			...row,
			phone: displayPhone(row.waId),
			lastMessageAt: row.lastMessageAt.toISOString(),
		}));
	}

	async thread(organizationId: string, threadId: string, take: number) {
		const thread = await this.db.whatsAppThread.findFirst({
			where: { id: threadId, organizationId },
			select: {
				id: true,
				waId: true,
				profileName: true,
				contactId: true,
				companyId: true,
				lastMessageAt: true,
				messageCount: true,
				connection: {
					select: { id: true, displayPhone: true, phoneNumberId: true },
				},
			},
		});

		if (!thread) throw new NotFoundException("Conversation not found.");

		const messages = await this.db.whatsAppMessage.findMany({
			where: { threadId },
			orderBy: { sentAt: "desc" },
			take,
			select: {
				id: true,
				waMessageId: true,
				direction: true,
				kind: true,
				body: true,
				caption: true,
				mediaMime: true,
				fromWaId: true,
				sentAt: true,
				status: true,
				failedTitle: true,
			},
		});

		return {
			...thread,
			phone: displayPhone(thread.waId),
			lastMessageAt: thread.lastMessageAt.toISOString(),
			messages: messages.reverse().map((message) => ({
				...message,
				sentAt: message.sentAt.toISOString(),
			})),
		};
	}

	async send(
		organizationId: string,
		userId: string,
		input: { threadId: string; body: string },
	) {
		const thread = await this.db.whatsAppThread.findFirst({
			where: { id: input.threadId, organizationId },
			select: {
				id: true,
				waId: true,
				connection: {
					select: {
						id: true,
						phoneNumberId: true,
						displayPhone: true,
						accessToken: true,
					},
				},
			},
		});

		if (!thread) throw new NotFoundException("Conversation not found.");

		const accessToken =
			thread.connection.accessToken ?? this.config.fallbackToken();

		if (!accessToken) {
			throw new ServiceUnavailableException(
				"No WhatsApp access token is configured, so the CRM cannot send. Add one on Settings → Connections, or set WHATSAPP_ACCESS_TOKEN.",
			);
		}

		const result = await this.client.sendText({
			phoneNumberId: thread.connection.phoneNumberId,
			accessToken,
			to: thread.waId,
			body: input.body,
		});

		if (!result.ok) {
			await this.db.whatsAppConnection.update({
				where: { id: thread.connection.id },
				data: { lastError: result.message },
			});

			throw new BadRequestException(result.message);
		}

		await this.sync.recordOutbound({
			threadId: thread.id,
			waMessageId: result.waMessageId,
			body: input.body,
			fromWaId:
				thread.connection.displayPhone ?? thread.connection.phoneNumberId,
			userId,
		});

		return this.thread(organizationId, thread.id, 50);
	}

	private async requireManager(
		organizationId: string,
		userId: string,
	): Promise<void> {
		if (!canManageWhatsApp(await this.roleOf(organizationId, userId))) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the WhatsApp connection.",
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
}

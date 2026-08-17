import {
	ActivityType,
	type Db,
	WhatsAppDeliveryStatus,
	WhatsAppDirection,
	WhatsAppSyncStatus,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type { ParsedChange, ParsedMessage, ParsedStatus } from "./payload";
import { displayPhone } from "./phone";
import { WhatsAppMatchService } from "./whatsapp-match.service";

const PREVIEW_LIMIT = 280;

type Connection = {
	id: string;
	organizationId: string;
	ownerId: string;
	autoCreate: boolean;
};

@Injectable()
export class WhatsAppSyncService {
	private readonly logger = new Logger(WhatsAppSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: WhatsAppMatchService,
		private readonly stamp: ActivityStampService,
	) {}

	async ingest(changes: readonly ParsedChange[]): Promise<{ stored: number }> {
		let stored = 0;

		for (const change of changes) {
			const connection = await this.connectionFor(change.phoneNumberId);

			if (!connection) {
				this.logger.warn({
					message:
						"WhatsApp event for a number no workspace has connected — ignoring",
					phoneNumberId: change.phoneNumberId,
				});
				continue;
			}

			stored += await this.applyChange(connection, change);
		}

		return { stored };
	}

	private async applyChange(
		connection: Connection,
		change: ParsedChange,
	): Promise<number> {
		const byThread = new Map<string, ParsedMessage[]>();

		for (const message of change.messages) {
			const existing = byThread.get(message.waId);
			if (existing) existing.push(message);
			else byThread.set(message.waId, [message]);
		}

		let stored = 0;

		for (const [waId, messages] of byThread) {
			stored += await this.applyThread(
				connection,
				waId,
				change.profileNames[waId] ?? null,
				messages,
			);
		}

		for (const status of change.statuses) {
			await this.applyStatus(connection, status);
		}

		await this.db.whatsAppConnection.update({
			where: { id: connection.id },
			data: {
				lastEventAt: new Date(),
				status: WhatsAppSyncStatus.IDLE,
				lastError: null,
			},
		});

		return stored;
	}

	private async applyThread(
		connection: Connection,
		waId: string,
		profileName: string | null,
		messages: readonly ParsedMessage[],
	): Promise<number> {
		const ordered = [...messages].sort(
			(left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
		);

		const first = ordered[0];
		const last = ordered[ordered.length - 1];
		if (!first || !last) return 0;

		const inbound = ordered.some((message) => message.direction === "INBOUND");

		const resolved = await this.match.resolve({
			organizationId: connection.organizationId,
			waId,
			profileName,
			allowCreate: connection.autoCreate && inbound,
			ownerId: connection.ownerId,
		});

		const thread = await this.db.whatsAppThread.upsert({
			where: {
				connectionId_waId: { connectionId: connection.id, waId },
			},
			create: {
				organizationId: connection.organizationId,
				connectionId: connection.id,
				waId,
				profileName,
				contactId: resolved.contactId,
				companyId: resolved.companyId,
				firstMessageAt: first.sentAt,
				lastMessageAt: last.sentAt,
			},
			update: {
				...(profileName ? { profileName } : {}),
				...(resolved.contactId ? { contactId: resolved.contactId } : {}),
				...(resolved.companyId ? { companyId: resolved.companyId } : {}),
			},
			select: { id: true, contactId: true, companyId: true },
		});

		const written = await this.db.whatsAppMessage.createMany({
			data: ordered.map((message) => ({
				threadId: thread.id,
				waMessageId: message.waMessageId,
				direction:
					message.direction === "INBOUND"
						? WhatsAppDirection.INBOUND
						: WhatsAppDirection.OUTBOUND,
				kind: message.kind,
				body: message.body,
				caption: message.caption,
				mediaId: message.mediaId,
				mediaMime: message.mediaMime,
				fromWaId: message.fromWaId,
				sentAt: message.sentAt,
			})),
			skipDuplicates: true,
		});

		if (written.count === 0) return 0;

		const totals = await this.db.whatsAppMessage.aggregate({
			where: { threadId: thread.id },
			_count: { _all: true },
			_min: { sentAt: true },
			_max: { sentAt: true },
		});

		await this.db.whatsAppThread.update({
			where: { id: thread.id },
			data: {
				messageCount: totals._count._all,
				firstMessageAt: totals._min.sentAt ?? first.sentAt,
				lastMessageAt: totals._max.sentAt ?? last.sentAt,
			},
		});

		await this.stampActivity(connection.organizationId, thread.id, {
			waId,
			profileName,
			latest: last,
			occurredAt: totals._max.sentAt ?? last.sentAt,
			contactId: thread.contactId,
			companyId: thread.companyId,
			userId: connection.ownerId,
		});

		return written.count;
	}

	private async stampActivity(
		organizationId: string,
		whatsAppThreadId: string,
		summary: {
			waId: string;
			profileName: string | null;
			latest: ParsedMessage;
			occurredAt: Date;
			contactId: string | null;
			companyId: string | null;
			userId: string;
		},
	): Promise<void> {
		const subject = `WhatsApp with ${summary.profileName ?? displayPhone(summary.waId)}`;
		const body = preview(summary.latest);

		const activity = await this.db.activity.upsert({
			where: { whatsAppThreadId },
			create: {
				organizationId,
				type: ActivityType.WHATSAPP,
				subject,
				body,
				occurredAt: summary.occurredAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
				createdById: summary.userId,
				whatsAppThreadId,
				meta: { synced: true, source: "whatsapp" },
			},
			update: {
				subject,
				body,
				occurredAt: summary.occurredAt,
				...(summary.contactId ? { contactId: summary.contactId } : {}),
				...(summary.companyId ? { companyId: summary.companyId } : {}),
			},
			select: { createdAt: true },
		});

		await this.stamp.touch(
			organizationId,
			{ companyId: summary.companyId, contactId: summary.contactId },
			activity.createdAt,
		);
	}

	private async applyStatus(
		connection: Connection,
		status: ParsedStatus,
	): Promise<void> {
		const mapped = WhatsAppDeliveryStatus[status.status];

		await this.db.whatsAppMessage.updateMany({
			where: {
				waMessageId: status.waMessageId,
				thread: { connectionId: connection.id },
				OR: [{ statusAt: null }, { statusAt: { lt: status.at } }],
			},
			data: {
				status: mapped,
				statusAt: status.at,
				failedCode: status.failedCode,
				failedTitle: status.failedTitle,
			},
		});
	}

	async recordOutbound(
		organizationId: string,
		input: {
			threadId: string;
			waMessageId: string;
			body: string;
			fromWaId: string;
			userId: string;
		},
	): Promise<void> {
		const now = new Date();

		await this.db.whatsAppMessage.create({
			data: {
				threadId: input.threadId,
				waMessageId: input.waMessageId,
				direction: WhatsAppDirection.OUTBOUND,
				kind: "text",
				body: input.body,
				fromWaId: input.fromWaId,
				sentAt: now,
				status: WhatsAppDeliveryStatus.ACCEPTED,
				statusAt: now,
				sentByUserId: input.userId,
			},
		});

		const thread = await this.db.whatsAppThread.update({
			where: { id: input.threadId },
			data: {
				lastMessageAt: now,
				messageCount: { increment: 1 },
			},
			select: { contactId: true, companyId: true },
		});

		await this.db.activity.updateMany({
			where: { whatsAppThreadId: input.threadId },
			data: { occurredAt: now, body: input.body.slice(0, PREVIEW_LIMIT) },
		});

		await this.stamp.touch(
			organizationId,
			{ companyId: thread.companyId, contactId: thread.contactId },
			now,
		);
	}

	private async connectionFor(
		phoneNumberId: string,
	): Promise<Connection | null> {
		return this.db.whatsAppConnection.findUnique({
			where: { phoneNumberId },
			select: {
				id: true,
				organizationId: true,
				ownerId: true,
				autoCreate: true,
			},
		});
	}
}

function preview(message: ParsedMessage): string {
	const text = message.body ?? message.caption;

	if (text) return text.slice(0, PREVIEW_LIMIT);

	return message.kind === "unknown" ? "Message" : `[${message.kind}]`;
}

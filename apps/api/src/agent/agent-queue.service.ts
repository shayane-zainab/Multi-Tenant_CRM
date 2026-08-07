import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class AgentQueueService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async queuedCompanies(organizationId: string, ids: readonly string[]): Promise<Set<string>> {
		return this.queued(organizationId, "companyId", ids);
	}

	async queuedContacts(organizationId: string, ids: readonly string[]): Promise<Set<string>> {
		return this.queued(organizationId, "contactId", ids);
	}

	async isQueued(
		organizationId: string,
		subject: { companyId?: string; contactId?: string },
	): Promise<boolean> {
		const row = await this.db.agentTask.findFirst({
			where: {
				organizationId,
				finishedAt: null,
				...(subject.companyId ? { companyId: subject.companyId } : {}),
				...(subject.contactId ? { contactId: subject.contactId } : {}),
			},
			select: { id: true },
		});

		return row !== null;
	}

	private async queued(
		organizationId: string,
		column: "companyId" | "contactId",
		ids: readonly string[],
	): Promise<Set<string>> {
		if (ids.length === 0) return new Set();

		const rows = await this.db.agentTask.findMany({
			where: { organizationId, finishedAt: null, [column]: { in: [...ids] } },
			select: { [column]: true },
			distinct: [column],
		});

		return new Set(
			rows
				.map((row) => (row as Record<string, string | null>)[column])
				.filter((id): id is string => id !== null),
		);
	}
}

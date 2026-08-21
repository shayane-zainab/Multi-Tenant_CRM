import { canChangeRole, isWorkspaceRole, type WorkspaceRole } from "@crm/auth";
import type { Db } from "@crm/db";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export const LEAD_VISIBILITY = ["everyone", "own"] as const;

export type LeadVisibility = (typeof LEAD_VISIBILITY)[number];

export const DEFAULT_LEAD_VISIBILITY: LeadVisibility = "everyone";

function toVisibility(value: string | null | undefined): LeadVisibility {
	return value === "own" ? "own" : DEFAULT_LEAD_VISIBILITY;
}

function toRole(value: string): WorkspaceRole | null {
	return isWorkspaceRole(value) ? value : null;
}

@Injectable()
export class LeadVisibilityService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async setting(organizationId: string): Promise<LeadVisibility> {
		const row = await this.db.orgSetting.findUnique({
			where: { organizationId },
			select: { leadVisibility: true },
		});

		return toVisibility(row?.leadVisibility);
	}

	async restrictedTo(
		organizationId: string,
		userId: string,
	): Promise<string | null> {
		const [setting, member] = await Promise.all([
			this.setting(organizationId),
			this.db.member.findUnique({
				where: { organizationId_userId: { organizationId, userId } },
				select: { role: true },
			}),
		]);

		if (setting === "everyone") return null;
		if (canChangeRole(member ? toRole(member.role) : null)) return null;

		return userId;
	}

	async ownerScope(
		organizationId: string,
		userId: string,
	): Promise<{ ownerId?: string }> {
		const restricted = await this.restrictedTo(organizationId, userId);
		return restricted ? { ownerId: restricted } : {};
	}

	async requireManager(organizationId: string, userId: string): Promise<void> {
		const member = await this.db.member.findUnique({
			where: { organizationId_userId: { organizationId, userId } },
			select: { role: true },
		});

		if (!canChangeRole(member ? toRole(member.role) : null)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change who sees which leads.",
			);
		}
	}

	async set(
		organizationId: string,
		visibility: LeadVisibility,
	): Promise<LeadVisibility> {
		await this.db.orgSetting.upsert({
			where: { organizationId },
			create: { organizationId, leadVisibility: visibility },
			update: { leadVisibility: visibility },
		});

		return visibility;
	}
}

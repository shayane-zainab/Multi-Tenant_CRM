import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";

export const DEFAULT_WORKSPACE_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageWhatsApp(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canInviteMembers(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

async function findMembership(userId: string): Promise<string | undefined> {
	const membership = await db.member.findFirst({
		where: { userId },
		select: { organizationId: true },
		orderBy: { createdAt: "asc" },
	});

	return membership?.organizationId;
}

async function claimInvitation(userId: string): Promise<string | undefined> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { email: true },
	});

	if (!user?.email) return undefined;

	const invitation = await db.invitation.findFirst({
		where: {
			email: { equals: user.email, mode: "insensitive" },
			status: "pending",
			expiresAt: { gt: new Date() },
		},
		orderBy: { createdAt: "asc" },
		select: { id: true, organizationId: true, role: true },
	});

	if (!invitation) return undefined;

	try {
		await db.$transaction([
			db.member.create({
				data: {
					id: randomUUID(),
					organizationId: invitation.organizationId,
					userId,
					role: isWorkspaceRole(invitation.role ?? "")
						? (invitation.role as string)
						: "member",
					createdAt: new Date(),
				},
			}),
			db.invitation.update({
				where: { id: invitation.id },
				data: { status: "accepted" },
			}),
		]);

		return invitation.organizationId;
	} catch {
		return await findMembership(userId);
	}
}

export async function ensureOrganizationMembership(
	userId: string,
): Promise<string | undefined> {
	const existing = await findMembership(userId);
	if (existing) return existing;

	const invited = await claimInvitation(userId);
	if (invited) return invited;

	const base = workspaceSlug(DEFAULT_WORKSPACE_NAME);

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const now = new Date();
		const slug = attempt === 0 ? base : `${base}-${randomUUID().slice(0, 8)}`;

		try {
			const organization = await db.organization.create({
				data: {
					id: randomUUID(),
					name: DEFAULT_WORKSPACE_NAME,
					slug,
					createdAt: now,
				},
				select: { id: true },
			});

			await db.member.create({
				data: {
					id: randomUUID(),
					organizationId: organization.id,
					userId,
					role: "owner",
					createdAt: now,
				},
			});

			return organization.id;
		} catch {
			const raced = await findMembership(userId);
			if (raced) return raced;
		}
	}

	return undefined;
}

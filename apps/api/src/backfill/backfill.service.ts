import { onSignedIn } from "@crm/auth";
import { type Db, EnrichmentStatus, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { FaviconService } from "../companies/favicon.service";
import { InjectDatabase } from "../database/database.constants";
import { ImageMirrorService } from "./image-mirror.service";

export type BackfillScope = "companies" | "contacts" | "deals";

export type BackfillResult = {
	queued: number;
	alreadyQueued: number;
	remaining: number;
	iconsResolving: number;
};

const MAX_PER_RUN = 500;

const MAX_FAVICONS = 25;

const NEVER_SUCCEEDED: Prisma.EnumEnrichmentStatusFilter = {
	in: [EnrichmentStatus.PENDING, EnrichmentStatus.FAILED],
};

const AUTO_KEY = "backfill:auto";

const AUTO_EVERY_MS = 5 * 60_000;

/**
 * How long a fruitless photo search stands the contact down for.
 *
 * Long, because the answer rarely changes: somebody with no LinkedIn account
 * and no headshot on their employer's site is unlikely to acquire either this
 * week, and the team-page read costs credits every time it is asked.
 */
const RECHECK_PHOTO_AFTER_MS = 30 * 24 * 60 * 60_000;

const RECHECK_BRAND_AFTER_MS = 30 * 24 * 60 * 60_000;

const RECHECK_WORKSPACE_AFTER_MS = 7 * 24 * 60 * 60_000;

@Injectable()
export class BackfillService implements OnModuleInit {
	private readonly logger = new Logger(BackfillService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly favicon: FaviconService,
		private readonly images: ImageMirrorService,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	onModuleInit(): void {
		onSignedIn(() => {
			void this.auto();
		});
	}

	async auto(): Promise<{ started: boolean }> {
		if (await this.cache.get(AUTO_KEY)) return { started: false };
		await this.cache.set(AUTO_KEY, true, AUTO_EVERY_MS);

		void (async () => {
			try {
				const orgs = await this.db.organization.findMany({ select: { id: true } });
				
				let totalQueued = 0;
				let totalRemaining = 0;
				let totalIconsResolving = 0;

				for (const org of orgs) {
					await this.sweepWorkspace(org.id);

					const companies = await this.runCompanies(org.id, false);
					const contacts = await this.runContacts(org.id);

					totalQueued += companies.queued + contacts.queued;
					totalRemaining += companies.remaining + contacts.remaining;
					totalIconsResolving += companies.iconsResolving;
				}

				const mirrored = await this.images.sweep();

				this.logger.log({
					message: "Automatic backfill swept",
					queued: totalQueued,
					remaining: totalRemaining,
					iconsResolving: totalIconsResolving,
					imagesMirrored: mirrored.copied,
				});
			} catch (error) {
				this.logger.error(
					{ message: "Automatic backfill failed" },
					error instanceof Error ? error.stack : String(error),
				);
			}
		})();

		return { started: true };
	}

	private async sweepWorkspace(organizationId: string): Promise<void> {
		const us = await readWorkspaceIdentity(this.db, organizationId);

		if (!us?.website || us.profile) return;

		const attempted = await this.db.agentTask.findFirst({
			where: {
				organizationId,
				kind: "workspace-profile",
				finishedAt: { gte: new Date(Date.now() - RECHECK_WORKSPACE_AFTER_MS) },
			},
			select: { id: true },
		});

		if (attempted) return;

		await this.agent.workspaceChanged(
			organizationId,
			us.website,
			"We still have no profile of the company using this CRM",
		);
	}

	async run(organizationId: string, scope: BackfillScope): Promise<BackfillResult> {
		if (scope === "contacts") return this.runContacts(organizationId);

		return this.runCompanies(organizationId, scope === "deals");
	}

	private async runCompanies(organizationId: string, dealsOnly: boolean): Promise<BackfillResult> {
		const onDeals: Prisma.CompanyWhereInput = dealsOnly
			? { deals: { some: {} } }
			: {};

		const needsBrand = this.companiesNeedingBrand(organizationId);
		const needsArtwork = await this.companiesNeedingArtwork(organizationId);

		const [total, rows, artworkRows] = await Promise.all([
			this.db.company.count({
				where: { ...onDeals, OR: [needsBrand, needsArtwork] },
			}),
			this.db.company.findMany({
				where: { ...needsBrand, ...onDeals },
				orderBy: { createdAt: "asc" },
				take: MAX_PER_RUN,
				select: { id: true },
			}),
			this.db.company.findMany({
				where: { ...needsArtwork, ...onDeals },
				orderBy: { createdAt: "asc" },
				take: MAX_PER_RUN,
				select: { id: true },
			}),
		]);

		const companyIds = [
			...new Set([
				...rows.map((row) => row.id),
				...artworkRows.map((row) => row.id),
			]),
		].slice(0, MAX_PER_RUN);

		const brand = await this.agent.backfill(organizationId, {
			kind: "brand",
			reason: "Backfill — this company has no logo or icon",
			companyIds,
			budget: 2,
			priority: PRIORITY.brand,
		});

		const profile = await this.agent.backfill(organizationId, {
			kind: "company-profile",
			reason: "Backfill — this company was never successfully looked up",
			companyIds: rows.map((row) => row.id),
		});

		const queued = {
			queued: brand.queued + profile.queued,
			alreadyQueued: brand.alreadyQueued + profile.alreadyQueued,
		};

		const iconsResolving = dealsOnly ? 0 : await this.sweepFavicons(organizationId);

		return {
			...queued,
			remaining: Math.max(0, total - companyIds.length),
			iconsResolving,
		};
	}

	private async runContacts(organizationId: string): Promise<BackfillResult> {
		const needsPhoto = await this.contactsNeedingPhoto(organizationId);

		const [photoTotal, photoRows] = await Promise.all([
			this.db.contact.count({ where: needsPhoto }),
			this.db.contact.findMany({
				where: needsPhoto,
				orderBy: { createdAt: "asc" },
				take: MAX_PER_RUN,
				select: { id: true },
			}),
		]);

		const photos = await this.agent.backfill(organizationId, {
			kind: "portrait",
			reason: "Backfill — somewhere to look for a picture, and no picture",
			contactIds: photoRows.map((row) => row.id),
			budget: 1,
			priority: PRIORITY.portrait,
		});

		const headroom = MAX_PER_RUN - photoRows.length;

		const [researchTotal, researchRows] = await Promise.all([
			this.db.contact.count({ where: this.contactsNeverResearched(organizationId) }),
			headroom > 0
				? this.db.contact.findMany({
						where: this.contactsNeverResearched(organizationId),
						orderBy: { createdAt: "asc" },
						take: headroom,
						select: { id: true },
					})
				: Promise.resolve([]),
		]);

		const research = await this.agent.backfill(organizationId, {
			kind: "identify",
			reason: "Backfill — this contact was never researched",
			contactIds: researchRows.map((row) => row.id),
		});

		return {
			queued: photos.queued + research.queued,
			alreadyQueued: photos.alreadyQueued + research.alreadyQueued,
			remaining:
				Math.max(0, photoTotal - photoRows.length) +
				Math.max(0, researchTotal - researchRows.length),
			iconsResolving: 0,
		};
	}

	private async sweepFavicons(organizationId: string): Promise<number> {
		const rows = await this.db.company.findMany({
			where: { organizationId, domain: { not: null }, iconUrl: null },
			orderBy: { createdAt: "asc" },
			take: MAX_FAVICONS,
			select: { id: true, domain: true },
		});

		if (rows.length === 0) return 0;

		void (async () => {
			let resolved = 0;
			for (const row of rows) {
				if (await this.favicon.backfill(row.id, row.domain)) resolved += 1;
			}
			this.logger.log({
				message: "Favicon sweep finished",
				attempted: rows.length,
				resolved,
				organizationId,
			});
		})();

		return rows.length;
	}

	private companiesNeedingBrand(organizationId: string): Prisma.CompanyWhereInput {
		return { organizationId, domain: { not: null }, enrichmentStatus: NEVER_SUCCEEDED };
	}

	private async companiesNeedingArtwork(organizationId: string): Promise<Prisma.CompanyWhereInput> {
		const since = new Date(Date.now() - RECHECK_BRAND_AFTER_MS);

		const checked = await this.db.agentTask.findMany({
			where: { organizationId, kind: "brand", finishedAt: { gte: since } },
			select: { companyId: true },
		});

		const recentlyChecked = checked
			.map((row) => row.companyId)
			.filter((id): id is string => id !== null);

		return {
			organizationId,
			domain: { not: null },
			logoUrl: null,
			iconUrl: null,
			...(recentlyChecked.length > 0 ? { id: { notIn: recentlyChecked } } : {}),
		};
	}

	private async contactsNeedingPhoto(organizationId: string): Promise<Prisma.ContactWhereInput> {
		const since = new Date(Date.now() - RECHECK_PHOTO_AFTER_MS);

		const checked = await this.db.agentTask.findMany({
			where: { organizationId, kind: "portrait", finishedAt: { gte: since } },
			select: { contactId: true },
		});

		const recentlyChecked = checked
			.map((row) => row.contactId)
			.filter((id): id is string => id !== null);

		return {
			organizationId,
			imageUrl: null,
			...(recentlyChecked.length > 0 ? { id: { notIn: recentlyChecked } } : {}),
			OR: [
				{ linkedinUrl: { not: null } },
				{ githubUrl: { not: null } },
				{ company: { domain: { not: null } } },
			],
		};
	}

	private contactsNeverResearched(organizationId: string): Prisma.ContactWhereInput {
		return { organizationId, enrichmentStatus: NEVER_SUCCEEDED };
	}
}

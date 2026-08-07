import {
	type Db,
	type EnrichmentStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	type RecordSource,
} from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { blankToNull, toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { OPEN_DEAL_STAGES } from "../deals/deal-stage";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	CompanyCreateInput,
	CompanyListInput,
	CompanyUpdateInput,
} from "./companies.contracts";
import { normalizeDomain } from "./domain";
import { FaviconService } from "./favicon.service";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

export type CompanyRow = {
	id: string;
	name: string;
	domain: string | null;
	iconUrl: string | null;
	iconDarkUrl: string | null;
	iconTone: string | null;
	logoUrl: string | null;
	brandColor: string | null;
	industry: string | null;
	enrichmentStatus: EnrichmentStatus;
	queued: boolean;
	source: RecordSource;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	contactCount: number;
	openDealCount: number;
	lastActivityAt: string | null;
	createdAt: string;
};

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CompanyOrderByWithRelationInput
> = {
	name: (dir) => ({ name: dir }),
	domain: (dir) => ({ domain: dir }),
	industry: (dir) => ({ industry: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	contacts: (dir) => ({ contacts: { _count: dir } }),
	deals: (dir) => ({ deals: { _count: dir } }),
	owner: (dir) => ({ owner: { name: dir } }),
	lastActivity: (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } }),
};

@Injectable()
export class CompaniesService {
	private readonly logger = new Logger(CompaniesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
		private readonly favicon: FaviconService,
		private readonly stamp: ActivityStampService,
		private readonly conversion: ConversionService,
	) {}

	async list(
		organizationId: string,
		input: CompanyListInput,
	): Promise<ListResult<CompanyRow>> {
		const where = this.buildWhere(organizationId, input);
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.company.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, {
					createdAt: "desc",
				}),
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
					logoUrl: true,
					brandColor: true,
					industry: true,
					enrichmentStatus: true,
					source: true,
					owner: { select: OWNER_SELECT },
					_count: {
						select: {
							contacts: true,
							deals: { where: { stage: { in: [...OPEN_DEAL_STAGES] } } },
						},
					},
					lastActivityAt: true,
					createdAt: true,
				},
			}),
			this.db.company.count({ where }),
			this.facetCounts(organizationId, input),
		]);

		const queued = await this.queue.queuedCompanies(organizationId, rows.map((row) => row.id));

		return {
			rows: rows.map((row) => ({
				id: row.id,
				name: row.name,
				domain: row.domain,
				iconUrl: row.iconUrl,
				iconDarkUrl: row.iconDarkUrl,
				iconTone: row.iconTone,
				logoUrl: row.logoUrl,
				brandColor: row.brandColor,
				industry: row.industry,
				enrichmentStatus: row.enrichmentStatus,
				queued: queued.has(row.id),
				source: row.source,
				owner: row.owner,
				contactCount: row._count.contacts,
				openDealCount: row._count.deals,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
			})),
			total,
			facetCounts,
		};
	}

	async byId(organizationId: string, id: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: {
				id: true,
				organizationId: true,
				name: true,
				domain: true,
				website: true,
				description: true,
				logoUrl: true,
				logoDarkUrl: true,
				iconUrl: true,
				iconDarkUrl: true,
				iconTone: true,
				brandColor: true,
				industry: true,
				subIndustry: true,
				city: true,
				stateCode: true,
				country: true,
				countryCode: true,
				phone: true,
				email: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				pricingUrl: true,
				careersUrl: true,
				enrichmentStatus: true,
				enrichedAt: true,
				enrichmentError: true,
				source: true,
				createdAt: true,
				owner: { select: OWNER_SELECT },
				primaryContact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						title: true,
					},
				},
				contacts: {
					orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						imageUrl: true,
						owner: { select: OWNER_SELECT },
					},
				},
				deals: {
					orderBy: [{ stage: "asc" }, { expectedCloseDate: "asc" }],
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						baseAmount: true,
						expectedCloseDate: true,
						owner: { select: OWNER_SELECT },
					},
				},
			},
		});

		if (!company || company.organizationId !== organizationId) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		const { deals, primaryContact, enrichedAt, createdAt, organizationId: _, ...rest } = company;

		return {
			...rest,
			queued: await this.queue.isQueued(organizationId, { companyId: id }),
			createdAt: createdAt.toISOString(),
			enrichedAt: enrichedAt?.toISOString() ?? null,
			primaryContactId: primaryContact?.id ?? null,
			primaryContact,
			reportingCurrency: await this.conversion.reportingCurrency(organizationId),
			deals: deals.map((deal) => ({
				...deal,
				amount: undefined,
				baseAmount: undefined,
				amountCents: toCents(deal.amount),
				baseAmountCents: toCents(deal.baseAmount),
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async options(organizationId: string, q: string) {
		return this.db.company.findMany({
			where: this.buildWhere(organizationId, { q, owner: FACET_ALL, industry: FACET_ALL, enrichment: FACET_ALL, source: FACET_ALL } as any),
			select: { id: true, name: true, domain: true, iconUrl: true },
			orderBy: { name: "asc" },
			take: 100,
		});
	}

	async create(organizationId: string, input: CompanyCreateInput) {
		const domain = normalizeDomain(input.domain);

		if (domain) {
			const existing = await this.db.company.findUnique({
				where: { organizationId_domain: { organizationId, domain } },
				select: { id: true, name: true },
			});
			if (existing) {
				throw new ConflictException(
					`${existing.name} already uses the domain ${domain}.`,
				);
			}
		}

		const company = await this.db.company.create({
			data: {
				organizationId,
				name: input.name.trim(),
				domain,
				website: domain ? `https://${domain}` : null,
				ownerId: input.ownerId ?? null,
			},
			select: { id: true, name: true, domain: true },
		});

		this.logger.log({
			message: "Company created",
			companyId: company.id,
			domain: company.domain,
			organizationId,
		});

		await this.agent.companyCreated(organizationId, company.id);

		void this.favicon.backfill(company.id, company.domain);

		return company;
	}

	async update(
		organizationId: string,
		id: string,
		input: CompanyUpdateInput,
	) {
		const data: Prisma.CompanyUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.website !== undefined) data.website = blankToNull(input.website);
		if (input.description !== undefined) {
			data.description = blankToNull(input.description);
		}
		if (input.industry !== undefined)
			data.industry = blankToNull(input.industry);
		if (input.city !== undefined) data.city = blankToNull(input.city);
		if (input.stateCode !== undefined) {
			data.stateCode = blankToNull(input.stateCode);
		}
		if (input.country !== undefined) data.country = blankToNull(input.country);
		if (input.phone !== undefined) data.phone = blankToNull(input.phone);
		if (input.email !== undefined) data.email = blankToNull(input.email);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		if (input.domain !== undefined) {
			const domain = normalizeDomain(input.domain);
			if (input.domain.trim() && !domain) {
				throw new BadRequestException(
					`"${input.domain}" is not a domain — try something like "stripe.com".`,
				);
			}
			data.domain = domain;
			const current = await this.db.company.findUnique({
				where: { id },
				select: { domain: true, organizationId: true },
			});
			if (!current || current.organizationId !== organizationId) {
				throw new NotFoundException(`No company with id ${id}.`);
			}
			if (current.domain !== domain) {
				data.enrichmentStatus = "PENDING";
				data.enrichmentError = null;
				data.iconUrl = null;
				data.iconDarkUrl = null;
				data.iconTone = null;
			}
		}

		try {
			const updated = await this.db.company.update({
				where: { id, organizationId },
				data,
				select: { id: true, name: true, domain: true },
			});

			if (data.enrichmentStatus === "PENDING") {
				await this.agent.companyCreated(
					organizationId,
					id,
					"Domain changed — anything we knew was about a different company",
				);
				void this.favicon.backfill(id, updated.domain);
			}

			return updated;
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async delete(
		organizationId: string,
		id: string,
	): Promise<{ id: string; name: string }> {
		let deleted: { targets: StampTargets; name: string };

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const company = await tx.company.findUnique({
					where: { id },
					select: { organizationId: true, name: true },
				});

				if (!company || company.organizationId !== organizationId) {
					throw new NotFoundException(`No company with id ${id}.`);
				}

				const targets = await this.stamp.targetsOf(
					{ OR: [{ companyId: id }, { deal: { companyId: id } }] },
					tx,
				);

				await tx.agentTask.deleteMany({ where: { companyId: id } });

				await tx.company.delete({
					where: { id },
				});

				return { targets, name: company.name };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		await this.stamp.recomputeAfterDelete(deleted.targets, { companyId: id });

		this.logger.log({
			message: "Company deleted",
			companyId: id,
			name: deleted.name,
			organizationId,
		});

		return { id, name: deleted.name };
	}

	async enrich(organizationId: string, id: string): Promise<{ id: string; queued: boolean }> {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true, organizationId: true },
		});

		if (!company || company.organizationId !== organizationId) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		await this.db.company.update({
			where: { id },
			data: { enrichmentStatus: "PENDING", enrichmentError: null },
		});
		await this.agent.companyRequested(organizationId, id, "A rep asked for a fresh look");

		return { id, queued: true };
	}

	async research(organizationId: string, id: string, actingUserId: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true, domain: true, organizationId: true },
		});

		if (!company || company.organizationId !== organizationId) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		if (!company.domain) {
			throw new BadRequestException(
				"There is nothing to read without a domain — add one first.",
			);
		}

		await this.agent.companyRequested(
			organizationId,
			id,
			`Briefing requested by a rep (${actingUserId})`,
		);

		return { ok: true as const, queued: true as const };
	}

	async setPrimaryContact(
		organizationId: string,
		companyId: string,
		contactId: string | null,
	) {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: { organizationId: true },
		});

		if (!company || company.organizationId !== organizationId) {
			throw new NotFoundException(`No company with id ${companyId}.`);
		}

		if (contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { companyId: true, organizationId: true },
			});
			if (!contact || contact.organizationId !== organizationId) {
				throw new NotFoundException(`No contact with id ${contactId}.`);
			}
			if (contact.companyId !== companyId) {
				throw new BadRequestException(
					"That contact does not work at this company.",
				);
			}
		}

		try {
			return await this.db.company.update({
				where: { id: companyId },
				data: { primaryContactId: contactId },
				select: { id: true, primaryContactId: true },
			});
		} catch (error) {
			throw this.translate(error, companyId);
		}
	}

	private searchFilter(
		organizationId: string,
		q: string,
	): Prisma.CompanyWhereInput {
		const term = q.trim();
		const base: Prisma.CompanyWhereInput = { organizationId };
		if (!term) return base;

		return {
			...base,
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ domain: { contains: term, mode: "insensitive" } },
			],
		};
	}

	private buildWhere(
		organizationId: string,
		input: CompanyListInput,
	): Prisma.CompanyWhereInput {
		const where: Prisma.CompanyWhereInput = {
			...this.searchFilter(organizationId, input.q),
			...ownerFilter(input.owner),
		};

		if (input.industry !== FACET_ALL) {
			where.industry = input.industry;
		}

		if (input.enrichment !== FACET_ALL) {
			where.enrichmentStatus = input.enrichment as EnrichmentStatus;
		}

		if (input.source !== FACET_ALL) {
			where.source = input.source as RecordSource;
		}

		return where;
	}

	private async facetCounts(
		organizationId: string,
		input: CompanyListInput,
	) {
		const where = this.searchFilter(organizationId, input.q);

		const [owners, industries, enrichment, sources] = await Promise.all([
			this.db.company.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["industry"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["enrichmentStatus"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["source"],
				where,
				_count: { _all: true },
			}),
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			industry: countsByKey(industries, "industry"),
			enrichment: countsByKey(enrichment, "enrichmentStatus"),
			source: countsByKey(sources, "source"),
		};
	}

	private translate(error: unknown, id: string): unknown {
		if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException(`No company with id ${id}.`);
			}
			if (error.code === "P2002") {
				return new ConflictException(
					"Another company already uses that domain.",
				);
			}
		}
		return error;
	}
}

import {
	ActivityType,
	type Db,
	type Prisma,
	Prisma as PrismaNamespace,
	StageKind,
} from "@crm/db";
import { normalizeCurrency } from "@crm/db/currency";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import {
	blankToNull,
	decimalFromCents,
	fromCents,
	toCents,
} from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import {
	CLOSED_DEALS,
	isClosedKind,
	isLosingKind,
	legacyStageFor,
	OPEN_DEALS,
} from "./deal-stage";
import type {
	ClosingWindow,
	DealCreateInput,
	DealListInput,
	DealUpdateInput,
	MoveDealsInput,
	SetStageInput,
} from "./deals.contracts";
import { CLOSING_WINDOWS } from "./deals.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const COMPANY_SELECT = {
	id: true,
	name: true,
	domain: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	logoUrl: true,
} as const;

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.DealOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	company: (dir) => [{ company: { name: dir } }, { name: "asc" }],
	stage: (dir) => [
		{ pipelineStage: { position: dir } },
		{ expectedCloseDate: "asc" },
	],
	amount: (dir) => [{ baseAmount: { sort: dir, nulls: "last" } }],
	expectedCloseDate: (dir) => [{ expectedCloseDate: dir }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { name: "asc" }],
	lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: "last" } }],
};

@Injectable()
export class DealsService {
	private readonly logger = new Logger(DealsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
		private readonly conversion: ConversionService,
	) {}

	async list(organizationId: string, input: DealListInput) {
		const where = this.buildWhere(organizationId, input);
		const { skip, take } = paginate(input);

		const openWhere = { ...where, ...OPEN_DEALS };
		const base = await this.conversion.reportingCurrency(organizationId);

		const [rows, total, facetCounts, openValue, unconverted] =
			await Promise.all([
				this.db.deal.findMany({
					where,
					skip,
					take,
					orderBy: resolveOrderBy(input, SORTABLE, [{ createdAt: "desc" }]),
					select: {
						id: true,
						name: true,
						stage: true,
						stageId: true,
						pipelineId: true,
						pipelineStage: { select: { id: true, name: true, kind: true } },
						amount: true,
						currency: true,
						baseAmount: true,
						expectedCloseDate: true,
						closedAt: true,
						company: { select: COMPANY_SELECT },
						owner: { select: OWNER_SELECT },
						lastActivityAt: true,
						createdAt: true,
					},
				}),
				this.db.deal.count({ where }),
				this.facetCounts(organizationId, input),
				this.db.deal.aggregate({
					where: { AND: [openWhere, this.conversion.countedWhere(base)] },
					_sum: { baseAmount: true },
				}),
				this.conversion.unconverted(organizationId, openWhere),
			]);

		return {
			rows: rows.map(
				({
					amount,
					baseAmount,
					expectedCloseDate,
					closedAt,
					lastActivityAt,
					createdAt,
					...row
				}) => ({
					...row,
					amountCents: toCents(amount),
					baseAmountCents: toCents(baseAmount),
					expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
					closedAt: closedAt?.toISOString() ?? null,
					lastActivityAt: lastActivityAt?.toISOString() ?? null,
					createdAt: createdAt.toISOString(),
				}),
			),
			total,
			facetCounts,
			openValueCents: toCents(openValue._sum.baseAmount),
			reportingCurrency: base,
			unconverted,
		} satisfies ListResult<unknown> & {
			openValueCents: number | null;
			reportingCurrency: string;
			unconverted: { count: number; currencies: string[] };
		};
	}

	async byId(organizationId: string, id: string) {
		const deal = await this.db.deal.findUnique({
			where: { id },
			select: {
				id: true,
				organizationId: true,
				name: true,
				description: true,
				stage: true,
				stageId: true,
				pipelineId: true,
				pipelineStage: {
					select: { id: true, name: true, kind: true, position: true },
				},
				pipeline: { select: { id: true, name: true } },
				stageChangedAt: true,
				amount: true,
				currency: true,
				baseAmount: true,
				fxRate: true,
				fxRateAt: true,
				expectedCloseDate: true,
				closedAt: true,
				closedReason: true,
				createdAt: true,
				company: { select: { ...COMPANY_SELECT, industry: true } },
				owner: { select: OWNER_SELECT },
				contacts: {
					select: {
						role: true,
						contact: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								email: true,
								title: true,
								imageUrl: true,
							},
						},
					},
				},
			},
		});

		if (!deal || deal.organizationId !== organizationId) {
			throw new NotFoundException(`No deal with id ${id}.`);
		}

		const {
			contacts,
			amount,
			baseAmount,
			fxRate,
			fxRateAt,
			organizationId: _,
			...rest
		} = deal;

		return {
			...rest,
			amountCents: toCents(amount),
			baseAmountCents: toCents(baseAmount),
			reportingCurrency:
				await this.conversion.reportingCurrency(organizationId),
			fxRate: fxRate?.toNumber() ?? null,
			fxRateAt: fxRateAt?.toISOString() ?? null,
			stageChangedAt: deal.stageChangedAt.toISOString(),
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			closedAt: deal.closedAt?.toISOString() ?? null,
			createdAt: deal.createdAt.toISOString(),
			contacts: contacts.map(({ role, contact }) => ({ ...contact, role })),
		};
	}

	async create(organizationId: string, input: DealCreateInput) {
		const stage = await this.resolveStage(organizationId, input.stageId);
		const closed = isClosedKind(stage.kind);
		const now = new Date();

		const currency = normalizeCurrency(
			input.currency ??
				(await this.conversion.reportingCurrency(organizationId)),
		);
		const fx = await this.conversion.dealFields(
			organizationId,
			decimalFromCents(input.amountCents),
			currency,
		);

		try {
			const deal = await this.db.deal.create({
				data: {
					organizationId,
					name: input.name.trim(),
					companyId: input.companyId,
					ownerId: input.ownerId,
					stage: legacyStageFor(stage.kind),
					pipelineId: stage.pipelineId,
					stageId: stage.id,
					stageChangedAt: now,
					closedAt: closed ? now : null,
					amount: fromCents(input.amountCents),
					currency,
					...fx,
					expectedCloseDate: parseDate(input.expectedCloseDate),
				},
				select: { id: true, name: true, companyId: true },
			});

			this.logger.log({
				message: "Deal created",
				dealId: deal.id,
				stageId: stage.id,
				organizationId,
			});

			return deal;
		} catch (error) {
			throw this.translateRelations(error);
		}
	}

	async update(organizationId: string, id: string, input: DealUpdateInput) {
		const data: Prisma.DealUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.description !== undefined) {
			data.description =
				input.description === null ? null : blankToNull(input.description);
		}
		if (input.companyId !== undefined) {
			data.company = { connect: { id: input.companyId } };
		}
		if (input.ownerId !== undefined) {
			data.owner = { connect: { id: input.ownerId } };
		}
		if (input.amountCents !== undefined) {
			data.amount = fromCents(input.amountCents);
		}
		if (input.currency !== undefined) {
			data.currency = normalizeCurrency(input.currency);
		}
		if (input.expectedCloseDate !== undefined) {
			data.expectedCloseDate = parseDate(input.expectedCloseDate);
		}

		if (input.amountCents !== undefined || input.currency !== undefined) {
			const current = await this.db.deal.findUnique({
				where: { id },
				select: { amount: true, currency: true, organizationId: true },
			});

			if (!current || current.organizationId !== organizationId) {
				throw new NotFoundException(`No deal with id ${id}.`);
			}

			const amount =
				input.amountCents !== undefined
					? decimalFromCents(input.amountCents)
					: current.amount;
			const currency =
				input.currency !== undefined
					? normalizeCurrency(input.currency)
					: normalizeCurrency(current.currency);

			Object.assign(
				data,
				await this.conversion.dealFields(organizationId, amount, currency),
			);
		}

		try {
			return await this.db.deal.update({
				where: { id, organizationId },
				data,
				select: { id: true, name: true },
			});
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
				const row = await tx.deal.findUnique({
					where: { id },
					select: { organizationId: true, name: true },
				});

				if (!row || row.organizationId !== organizationId) {
					throw new NotFoundException(`No deal with id ${id}.`);
				}

				const targets = await this.stamp.targetsOf({ dealId: id }, tx);

				await tx.deal.delete({ where: { id } });

				return { targets, name: row.name };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		await this.stamp.recomputeAfterDelete(organizationId, deleted.targets, {
			dealId: id,
		});

		this.logger.log({
			message: "Deal deleted",
			dealId: id,
			name: deleted.name,
			organizationId,
		});

		return { id, name: deleted.name };
	}

	async setStage(
		organizationId: string,
		input: SetStageInput,
		actingUserId: string,
	) {
		const deal = await this.db.deal.findFirst({
			where: { id: input.id, organizationId },
			select: {
				id: true,
				companyId: true,
				stageId: true,
				pipelineStage: { select: { name: true } },
			},
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${input.id}.`);
		}

		const target = await this.resolveStage(organizationId, input.stageId);

		if (deal.stageId === target.id) {
			return { id: deal.id, stageId: target.id, changed: false };
		}

		const closedReason = input.closedReason?.trim();

		if (isLosingKind(target.kind) && !closedReason) {
			throw new BadRequestException(
				"Say why it was lost — a closed-lost deal with no reason teaches nobody anything.",
			);
		}

		const now = new Date();
		const closed = isClosedKind(target.kind);

		const [updated] = await this.db.$transaction([
			this.db.deal.update({
				where: { id: deal.id },
				data: {
					stage: legacyStageFor(target.kind),
					pipelineId: target.pipelineId,
					stageId: target.id,
					stageChangedAt: now,
					closedAt: closed ? now : null,
					closedReason: closed ? (closedReason ?? null) : null,
				},
				select: { id: true, stageId: true },
			}),
			this.db.activity.create({
				data: {
					organizationId,
					type: ActivityType.STAGE_CHANGE,
					subject: "Stage changed",
					body: closedReason ?? null,
					occurredAt: now,
					companyId: deal.companyId,
					dealId: deal.id,
					createdById: actingUserId,
					meta: {
						from: deal.pipelineStage?.name ?? null,
						to: target.name,
					},
				},
			}),
		]);

		await this.stamp.touch(
			organizationId,
			{ companyId: deal.companyId, dealId: deal.id },
			new Date(),
		);

		this.logger.log({
			message: "Deal stage changed",
			dealId: deal.id,
			from: deal.pipelineStage?.name ?? null,
			to: target.name,
			organizationId,
		});

		return { ...updated, changed: true };
	}

	async moveMany(
		organizationId: string,
		input: MoveDealsInput,
		actingUserId: string,
	): Promise<{ moved: number }> {
		const target = await this.resolveStage(organizationId, input.stageId);
		const closedReason = input.closedReason?.trim();

		if (isLosingKind(target.kind) && !closedReason) {
			throw new BadRequestException(
				"Say why they were lost — moving deals into a losing stage needs a reason.",
			);
		}

		const deals = await this.db.deal.findMany({
			where: { id: { in: input.dealIds }, organizationId },
			select: { id: true, companyId: true },
		});

		if (deals.length === 0) {
			throw new NotFoundException("None of those deals are in this workspace.");
		}

		const now = new Date();
		const closed = isClosedKind(target.kind);
		const ids = deals.map((deal) => deal.id);

		await this.db.$transaction([
			this.db.deal.updateMany({
				where: { id: { in: ids }, organizationId },
				data: {
					stage: legacyStageFor(target.kind),
					pipelineId: target.pipelineId,
					stageId: target.id,
					stageChangedAt: now,
					closedAt: closed ? now : null,
					closedReason: closed ? (closedReason ?? null) : null,
				},
			}),
			this.db.activity.createMany({
				data: deals.map((deal) => ({
					organizationId,
					type: ActivityType.STAGE_CHANGE,
					subject: "Stage changed",
					body: closedReason ?? null,
					occurredAt: now,
					companyId: deal.companyId,
					dealId: deal.id,
					createdById: actingUserId,
					meta: { to: target.name, bulk: true },
				})),
			}),
		]);

		this.logger.log({
			message: "Deals moved",
			organizationId,
			userId: actingUserId,
			stageId: target.id,
			moved: ids.length,
		});

		return { moved: ids.length };
	}

	private async resolveStage(organizationId: string, stageId?: string) {
		if (stageId) {
			const stage = await this.db.pipelineStage.findFirst({
				where: { id: stageId, pipeline: { organizationId } },
				select: { id: true, name: true, kind: true, pipelineId: true },
			});

			if (!stage) {
				throw new NotFoundException("That stage is not in this workspace.");
			}

			return stage;
		}

		const stage = await this.db.pipelineStage.findFirst({
			where: {
				pipeline: { organizationId, archivedAt: null },
			},
			orderBy: [
				{ pipeline: { isDefault: "desc" } },
				{ pipeline: { position: "asc" } },
				{ position: "asc" },
			],
			select: { id: true, name: true, kind: true, pipelineId: true },
		});

		return stage ?? (await this.createDefaultPipeline(organizationId));
	}

	private async createDefaultPipeline(organizationId: string) {
		const created = await this.db.pipeline.create({
			data: {
				organizationId,
				name: "Default",
				position: 0,
				isDefault: true,
				stages: {
					create: [
						{ name: "New lead", kind: StageKind.LEAD, position: 0 },
						{ name: "Contacted", kind: StageKind.LEAD, position: 1 },
						{ name: "Qualified", kind: StageKind.OPEN, position: 2 },
						{ name: "Proposal sent", kind: StageKind.OPEN, position: 3 },
						{ name: "Won", kind: StageKind.WON, position: 4 },
						{ name: "Lost", kind: StageKind.LOST, position: 5 },
					],
				},
			},
			select: {
				stages: {
					orderBy: { position: "asc" },
					take: 1,
					select: { id: true, name: true, kind: true, pipelineId: true },
				},
			},
		});

		const first = created.stages[0];

		if (!first) {
			throw new BadRequestException(
				"This workspace has no pipeline to put a deal in. Create one in Settings.",
			);
		}

		this.logger.log({ message: "Default pipeline created", organizationId });

		return first;
	}

	private searchFilter(
		organizationId: string,
		q: string,
	): Prisma.DealWhereInput {
		const term = q.trim();
		const base: Prisma.DealWhereInput = { organizationId };
		if (!term) return base;

		return {
			...base,
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ company: { name: { contains: term, mode: "insensitive" } } },
			],
		};
	}

	private buildWhere(
		organizationId: string,
		input: DealListInput,
	): Prisma.DealWhereInput {
		const where: Prisma.DealWhereInput = this.searchFilter(
			organizationId,
			input.q,
		);

		if (input.owner !== FACET_ALL) {
			where.ownerId =
				input.owner === FACET_UNASSIGNED ? { in: [] } : input.owner;
		}

		if (input.status === "open") {
			Object.assign(where, OPEN_DEALS);
		} else if (input.status === "closed") {
			Object.assign(where, CLOSED_DEALS);
		}

		if (input.stage !== FACET_ALL) {
			where.stageId = input.stage;
		}

		if (input.pipeline !== FACET_ALL) {
			where.pipelineId = input.pipeline;
		}

		if (input.closing !== FACET_ALL) {
			Object.assign(where, closingFilter(input.closing as ClosingWindow));
		}

		return where;
	}

	private async facetCounts(organizationId: string, input: DealListInput) {
		const where = this.searchFilter(organizationId, input.q);

		const [
			owners,
			stages,
			pipelines,
			openCount,
			closedCount,
			...closingCounts
		] = await Promise.all([
			this.db.deal.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.deal.groupBy({
				by: ["stageId"],
				where,
				_count: { _all: true },
			}),
			this.db.deal.groupBy({
				by: ["pipelineId"],
				where,
				_count: { _all: true },
			}),
			this.db.deal.count({ where: { ...where, ...OPEN_DEALS } }),
			this.db.deal.count({ where: { ...where, ...CLOSED_DEALS } }),
			...CLOSING_WINDOWS.map((window) =>
				this.db.deal.count({ where: { ...where, ...closingFilter(window) } }),
			),
		]);

		return {
			status: { open: openCount, closed: closedCount },
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			stage: countsByKey(stages, "stageId", FACET_UNASSIGNED),
			pipeline: countsByKey(pipelines, "pipelineId", FACET_UNASSIGNED),
			closing: Object.fromEntries(
				CLOSING_WINDOWS.map((window, index) => [
					window,
					closingCounts[index] ?? 0,
				]),
			),
		};
	}

	private translate(error: unknown, id: string): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2025"
		) {
			return new NotFoundException(`No deal with id ${id}.`);
		}
		return this.translateRelations(error);
	}

	private translateRelations(error: unknown): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			(error.code === "P2003" || error.code === "P2025")
		) {
			return new BadRequestException(
				"That company or owner does not exist any more.",
			);
		}
		return error;
	}
}

function closingFilter(window: ClosingWindow): Prisma.DealWhereInput {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
	const startOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

	switch (window) {
		case "overdue":
			return {
				expectedCloseDate: { lt: now },
				...OPEN_DEALS,
			};
		case "this-month":
			return {
				expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth },
			};
		case "next-month":
			return {
				expectedCloseDate: { gte: startOfNextMonth, lt: startOfMonthAfter },
			};
		case "later":
			return { expectedCloseDate: { gte: startOfMonthAfter } };
		case "none":
			return { expectedCloseDate: null };
	}
}

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}

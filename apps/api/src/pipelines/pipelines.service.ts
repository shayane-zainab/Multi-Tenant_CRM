import { canChangeRole, isWorkspaceRole, type WorkspaceRole } from "@crm/auth";
import { type Db, StageKind } from "@crm/db";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	AddStageInput,
	CreatePipelineInput,
	PipelineIdInput,
	RemoveStageInput,
	RenamePipelineInput,
	ReorderStagesInput,
	UpdateStageInput,
} from "./pipelines.contracts";

export interface Stage {
	id: string;
	name: string;
	kind: StageKind;
	position: number;
	deals: number;
}

export interface Pipeline {
	id: string;
	name: string;
	position: number;
	isDefault: boolean;
	stages: Stage[];
	deals: number;
}

const STARTER_STAGES: { name: string; kind: StageKind }[] = [
	{ name: "New lead", kind: StageKind.LEAD },
	{ name: "Contacted", kind: StageKind.LEAD },
	{ name: "Qualified", kind: StageKind.OPEN },
	{ name: "Proposal sent", kind: StageKind.OPEN },
	{ name: "Won", kind: StageKind.WON },
	{ name: "Lost", kind: StageKind.LOST },
];

function toRole(value: string): WorkspaceRole | null {
	return isWorkspaceRole(value) ? value : null;
}

@Injectable()
export class PipelinesService {
	private readonly logger = new Logger(PipelinesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(organizationId: string): Promise<Pipeline[]> {
		const rows = await this.db.pipeline.findMany({
			where: { organizationId, archivedAt: null },
			orderBy: [{ position: "asc" }, { createdAt: "asc" }],
			select: {
				id: true,
				name: true,
				position: true,
				isDefault: true,
				_count: { select: { deals: true } },
				stages: {
					orderBy: [{ position: "asc" }, { createdAt: "asc" }],
					select: {
						id: true,
						name: true,
						kind: true,
						position: true,
						_count: { select: { deals: true } },
					},
				},
			},
		});

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			position: row.position,
			isDefault: row.isDefault,
			deals: row._count.deals,
			stages: row.stages.map((stage) => ({
				id: stage.id,
				name: stage.name,
				kind: stage.kind,
				position: stage.position,
				deals: stage._count.deals,
			})),
		}));
	}

	async create(
		organizationId: string,
		userId: string,
		input: CreatePipelineInput,
	): Promise<Pipeline> {
		await this.requireManager(organizationId, userId);

		const stages = input.stages ?? STARTER_STAGES;

		if (!stages.some((stage) => stage.kind === StageKind.OPEN)) {
			throw new ConflictException(
				"A pipeline needs at least one open stage, or nothing counts as a live deal.",
			);
		}

		const clash = await this.db.pipeline.findFirst({
			where: { organizationId, name: input.name },
			select: { id: true },
		});

		if (clash) {
			throw new ConflictException(
				`This workspace already has a pipeline called ${input.name}.`,
			);
		}

		const last = await this.db.pipeline.findFirst({
			where: { organizationId },
			orderBy: { position: "desc" },
			select: { position: true },
		});

		const created = await this.db.pipeline.create({
			data: {
				organizationId,
				name: input.name,
				position: (last?.position ?? -1) + 1,
				stages: {
					create: stages.map((stage, index) => ({
						name: stage.name,
						kind: stage.kind,
						position: index,
					})),
				},
			},
			select: { id: true },
		});

		this.logger.log({
			message: "Pipeline created",
			organizationId,
			userId,
			pipelineId: created.id,
		});

		return this.require(organizationId, created.id);
	}

	async rename(
		organizationId: string,
		userId: string,
		input: RenamePipelineInput,
	): Promise<Pipeline> {
		await this.requireManager(organizationId, userId);
		await this.requireOwned(organizationId, input.pipelineId);

		const clash = await this.db.pipeline.findFirst({
			where: {
				organizationId,
				name: input.name,
				id: { not: input.pipelineId },
			},
			select: { id: true },
		});

		if (clash) {
			throw new ConflictException(
				`This workspace already has a pipeline called ${input.name}.`,
			);
		}

		await this.db.pipeline.updateMany({
			where: { id: input.pipelineId, organizationId },
			data: { name: input.name },
		});

		return this.require(organizationId, input.pipelineId);
	}

	async archive(
		organizationId: string,
		userId: string,
		input: PipelineIdInput,
	): Promise<{ id: string }> {
		await this.requireManager(organizationId, userId);
		const pipeline = await this.requireOwned(organizationId, input.pipelineId);

		if (pipeline.isDefault) {
			throw new ConflictException(
				"The default pipeline cannot be archived. Make another one the default first.",
			);
		}

		const deals = await this.db.deal.count({
			where: { organizationId, pipelineId: input.pipelineId },
		});

		if (deals > 0) {
			throw new ConflictException(
				`${deals} ${deals === 1 ? "deal is" : "deals are"} still in this pipeline. Move them somewhere else first.`,
			);
		}

		await this.db.pipeline.updateMany({
			where: { id: input.pipelineId, organizationId },
			data: { archivedAt: new Date() },
		});

		this.logger.log({
			message: "Pipeline archived",
			organizationId,
			userId,
			pipelineId: input.pipelineId,
		});

		return { id: input.pipelineId };
	}

	async makeDefault(
		organizationId: string,
		userId: string,
		input: PipelineIdInput,
	): Promise<Pipeline[]> {
		await this.requireManager(organizationId, userId);
		await this.requireOwned(organizationId, input.pipelineId);

		await this.db.$transaction([
			this.db.pipeline.updateMany({
				where: { organizationId },
				data: { isDefault: false },
			}),
			this.db.pipeline.updateMany({
				where: { id: input.pipelineId, organizationId },
				data: { isDefault: true },
			}),
		]);

		return this.list(organizationId);
	}

	async addStage(
		organizationId: string,
		userId: string,
		input: AddStageInput,
	): Promise<Pipeline> {
		await this.requireManager(organizationId, userId);
		await this.requireOwned(organizationId, input.pipelineId);

		const clash = await this.db.pipelineStage.findFirst({
			where: { pipelineId: input.pipelineId, name: input.name },
			select: { id: true },
		});

		if (clash) {
			throw new ConflictException(
				`That pipeline already has a stage called ${input.name}.`,
			);
		}

		const last = await this.db.pipelineStage.findFirst({
			where: { pipelineId: input.pipelineId },
			orderBy: { position: "desc" },
			select: { position: true },
		});

		await this.db.pipelineStage.create({
			data: {
				pipelineId: input.pipelineId,
				name: input.name,
				kind: input.kind,
				position: (last?.position ?? -1) + 1,
			},
		});

		return this.require(organizationId, input.pipelineId);
	}

	async updateStage(
		organizationId: string,
		userId: string,
		input: UpdateStageInput,
	): Promise<Pipeline> {
		await this.requireManager(organizationId, userId);
		const stage = await this.requireStage(organizationId, input.stageId);

		if (input.name && input.name !== stage.name) {
			const clash = await this.db.pipelineStage.findFirst({
				where: {
					pipelineId: stage.pipelineId,
					name: input.name,
					id: { not: stage.id },
				},
				select: { id: true },
			});

			if (clash) {
				throw new ConflictException(
					`That pipeline already has a stage called ${input.name}.`,
				);
			}
		}

		if (input.kind && input.kind !== StageKind.OPEN) {
			const remaining = await this.db.pipelineStage.count({
				where: {
					pipelineId: stage.pipelineId,
					kind: StageKind.OPEN,
					id: { not: stage.id },
				},
			});

			if (remaining === 0) {
				throw new ConflictException(
					"A pipeline needs at least one open stage, or nothing counts as a live deal.",
				);
			}
		}

		await this.db.pipelineStage.update({
			where: { id: stage.id },
			data: {
				...(input.name ? { name: input.name } : {}),
				...(input.kind ? { kind: input.kind } : {}),
			},
		});

		return this.require(organizationId, stage.pipelineId);
	}

	async reorderStages(
		organizationId: string,
		userId: string,
		input: ReorderStagesInput,
	): Promise<Pipeline> {
		await this.requireManager(organizationId, userId);
		await this.requireOwned(organizationId, input.pipelineId);

		const stages = await this.db.pipelineStage.findMany({
			where: { pipelineId: input.pipelineId },
			select: { id: true },
		});

		const known = new Set(stages.map((stage) => stage.id));
		const given = new Set(input.stageIds);

		if (
			known.size !== given.size ||
			input.stageIds.some((id) => !known.has(id))
		) {
			throw new ConflictException(
				"That order does not list every stage in this pipeline exactly once.",
			);
		}

		await this.db.$transaction(
			input.stageIds.map((id, index) =>
				this.db.pipelineStage.update({
					where: { id },
					data: { position: index },
				}),
			),
		);

		return this.require(organizationId, input.pipelineId);
	}

	async removeStage(
		organizationId: string,
		userId: string,
		input: RemoveStageInput,
	): Promise<Pipeline> {
		await this.requireManager(organizationId, userId);
		const stage = await this.requireStage(organizationId, input.stageId);

		const deals = await this.db.deal.count({
			where: { organizationId, stageId: stage.id },
		});

		if (deals > 0) {
			throw new ConflictException(
				`${deals} ${deals === 1 ? "deal is" : "deals are"} in this stage. Move them first.`,
			);
		}

		const siblings = await this.db.pipelineStage.count({
			where: { pipelineId: stage.pipelineId },
		});

		if (siblings <= 1) {
			throw new ConflictException("A pipeline needs at least one stage.");
		}

		if (stage.kind === StageKind.OPEN) {
			const remaining = await this.db.pipelineStage.count({
				where: {
					pipelineId: stage.pipelineId,
					kind: StageKind.OPEN,
					id: { not: stage.id },
				},
			});

			if (remaining === 0) {
				throw new ConflictException(
					"A pipeline needs at least one open stage, or nothing counts as a live deal.",
				);
			}
		}

		await this.db.pipelineStage.delete({ where: { id: stage.id } });

		return this.require(organizationId, stage.pipelineId);
	}

	private async require(
		organizationId: string,
		pipelineId: string,
	): Promise<Pipeline> {
		const all = await this.list(organizationId);
		const found = all.find((pipeline) => pipeline.id === pipelineId);

		if (!found) {
			throw new NotFoundException("That pipeline no longer exists.");
		}

		return found;
	}

	private async requireOwned(organizationId: string, pipelineId: string) {
		const pipeline = await this.db.pipeline.findFirst({
			where: { id: pipelineId, organizationId },
			select: { id: true, isDefault: true },
		});

		if (!pipeline) {
			throw new NotFoundException("That pipeline no longer exists.");
		}

		return pipeline;
	}

	private async requireStage(organizationId: string, stageId: string) {
		const stage = await this.db.pipelineStage.findFirst({
			where: { id: stageId, pipeline: { organizationId } },
			select: { id: true, name: true, kind: true, pipelineId: true },
		});

		if (!stage) {
			throw new NotFoundException("That stage no longer exists.");
		}

		return stage;
	}

	private async requireManager(
		organizationId: string,
		userId: string,
	): Promise<void> {
		const member = await this.db.member.findUnique({
			where: { organizationId_userId: { organizationId, userId } },
			select: { role: true },
		});

		if (!canChangeRole(member ? toRole(member.role) : null)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change pipelines.",
			);
		}
	}
}

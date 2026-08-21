import { StageKind } from "@crm/db";
import { z } from "zod";

export const STAGE_KINDS = [
	StageKind.LEAD,
	StageKind.OPEN,
	StageKind.WON,
	StageKind.LOST,
] as const;

const name = z.string().trim().min(1).max(80);

export const createPipelineInput = z.object({
	name,
	stages: z
		.array(
			z.object({
				name,
				kind: z.enum(STAGE_KINDS),
			}),
		)
		.min(1)
		.max(30)
		.optional(),
});

export const renamePipelineInput = z.object({
	pipelineId: z.string().min(1),
	name,
});

export const pipelineIdInput = z.object({
	pipelineId: z.string().min(1),
});

export const addStageInput = z.object({
	pipelineId: z.string().min(1),
	name,
	kind: z.enum(STAGE_KINDS).default(StageKind.OPEN),
});

export const updateStageInput = z.object({
	stageId: z.string().min(1),
	name: name.optional(),
	kind: z.enum(STAGE_KINDS).optional(),
});

export const reorderStagesInput = z.object({
	pipelineId: z.string().min(1),
	stageIds: z.array(z.string().min(1)).min(1).max(30),
});

export const removeStageInput = z.object({
	stageId: z.string().min(1),
});

export type CreatePipelineInput = z.infer<typeof createPipelineInput>;
export type RenamePipelineInput = z.infer<typeof renamePipelineInput>;
export type PipelineIdInput = z.infer<typeof pipelineIdInput>;
export type AddStageInput = z.infer<typeof addStageInput>;
export type UpdateStageInput = z.infer<typeof updateStageInput>;
export type ReorderStagesInput = z.infer<typeof reorderStagesInput>;
export type RemoveStageInput = z.infer<typeof removeStageInput>;

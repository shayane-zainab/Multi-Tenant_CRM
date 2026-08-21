import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	addStageInput,
	createPipelineInput,
	pipelineIdInput,
	removeStageInput,
	renamePipelineInput,
	reorderStagesInput,
	updateStageInput,
} from "./pipelines.contracts";
import { PipelinesService } from "./pipelines.service";

@Router({ alias: "pipelines" })
@UseMiddlewares(AuthMiddleware)
export class PipelinesRouter {
	constructor(
		@Inject(PipelinesService) private readonly pipelines: PipelinesService,
	) {}

	@Query()
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.pipelines.list(ctx.organizationId);
	}

	@Mutation({ input: createPipelineInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createPipelineInput>,
	) {
		return this.pipelines.create(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: renamePipelineInput })
	async rename(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof renamePipelineInput>,
	) {
		return this.pipelines.rename(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: pipelineIdInput })
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineIdInput>,
	) {
		return this.pipelines.archive(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: pipelineIdInput })
	async makeDefault(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineIdInput>,
	) {
		return this.pipelines.makeDefault(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: addStageInput })
	async addStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addStageInput>,
	) {
		return this.pipelines.addStage(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: updateStageInput })
	async updateStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateStageInput>,
	) {
		return this.pipelines.updateStage(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: reorderStagesInput })
	async reorderStages(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof reorderStagesInput>,
	) {
		return this.pipelines.reorderStages(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: removeStageInput })
	async removeStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof removeStageInput>,
	) {
		return this.pipelines.removeStage(ctx.organizationId, ctx.user.id, input);
	}
}

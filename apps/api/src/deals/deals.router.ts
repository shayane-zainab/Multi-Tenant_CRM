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
	dealCreateInput,
	dealIdInput,
	dealListInput,
	dealUpdateArgs,
	moveDealsInput,
	setStageInput,
} from "./deals.contracts";
import { DealsService } from "./deals.service";

@Router({ alias: "deals" })
@UseMiddlewares(AuthMiddleware)
export class DealsRouter {
	constructor(@Inject(DealsService) private readonly deals: DealsService) {}

	@Query({ input: dealListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealListInput>,
	) {
		return this.deals.list(ctx.organizationId, input, ctx.user.id);
	}

	@Query({ input: dealIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.deals.byId(ctx.organizationId, id);
	}

	@Mutation({ input: dealCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealCreateInput>,
	) {
		return this.deals.create(ctx.organizationId, input);
	}

	@Mutation({ input: dealUpdateArgs })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealUpdateArgs>,
	) {
		return this.deals.update(ctx.organizationId, input.id, input.data);
	}

	@Mutation({ input: dealIdInput })
	async delete(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.deals.delete(ctx.organizationId, id);
	}

	@Mutation({ input: setStageInput })
	async setStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setStageInput>,
	) {
		return this.deals.setStage(ctx.organizationId, input, ctx.user.id);
	}

	@Mutation({ input: moveDealsInput })
	async move(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof moveDealsInput>,
	) {
		return this.deals.moveMany(ctx.organizationId, input, ctx.user.id);
	}

	@Query({ input: dealListInput })
	async exportRows(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealListInput>,
	) {
		return this.deals.exportRows(ctx.organizationId, input, ctx.user.id);
	}
}

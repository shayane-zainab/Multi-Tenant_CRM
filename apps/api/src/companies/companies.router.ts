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
	companyCreateInput,
	companyIdInput,
	companyListInput,
	companyOptionsInput,
	companyUpdateArgs,
	setPrimaryContactInput,
} from "./companies.contracts";
import { CompaniesService } from "./companies.service";

@Router({ alias: "companies" })
@UseMiddlewares(AuthMiddleware)
export class CompaniesRouter {
	constructor(
		@Inject(CompaniesService) private readonly companies: CompaniesService,
	) {}

	@Query({ input: companyListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof companyListInput>,
	) {
		return this.companies.list(ctx.organizationId, input);
	}

	@Query({ input: companyIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.byId(ctx.organizationId, id);
	}

	@Query({ input: companyOptionsInput })
	async options(@Ctx() ctx: AuthedTrpcContext, @Input("q") q: string) {
		return this.companies.options(ctx.organizationId, q);
	}

	@Mutation({ input: companyCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof companyCreateInput>,
	) {
		return this.companies.create(ctx.organizationId, input);
	}

	@Mutation({ input: companyUpdateArgs })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof companyUpdateArgs>,
	) {
		return this.companies.update(ctx.organizationId, input.id, input.data);
	}

	@Mutation({ input: companyIdInput })
	async delete(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.delete(ctx.organizationId, id);
	}

	@Mutation({ input: companyIdInput })
	async enrich(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.enrich(ctx.organizationId, id);
	}

	@Mutation({ input: companyIdInput })
	async research(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.research(ctx.organizationId, id, ctx.user.id);
	}

	@Mutation({ input: setPrimaryContactInput })
	async setPrimaryContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setPrimaryContactInput>,
	) {
		return this.companies.setPrimaryContact(
			ctx.organizationId,
			input.companyId,
			input.contactId,
		);
	}
}

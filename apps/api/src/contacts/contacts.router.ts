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
	contactCreateInput,
	contactIdInput,
	contactListInput,
	contactUpdateArgs,
	factDecisionInput,
} from "./contacts.contracts";
import { ContactsService } from "./contacts.service";

@Router({ alias: "contacts" })
@UseMiddlewares(AuthMiddleware)
export class ContactsRouter {
	constructor(
		@Inject(ContactsService) private readonly contacts: ContactsService,
	) {}

	@Query({ input: contactListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactListInput>,
	) {
		return this.contacts.list(ctx.organizationId, input, ctx.user.id);
	}

	@Query({ input: contactIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.contacts.byId(ctx.organizationId, id);
	}

	@Mutation({ input: contactCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactCreateInput>,
	) {
		return this.contacts.create(ctx.organizationId, input);
	}

	@Mutation({ input: contactUpdateArgs })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactUpdateArgs>,
	) {
		return this.contacts.update(ctx.organizationId, input.id, input.data);
	}

	@Mutation({ input: contactIdInput })
	async delete(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.contacts.delete(ctx.organizationId, id);
	}

	@Mutation({ input: contactIdInput })
	async enrich(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.contacts.enrich(ctx.organizationId, id);
	}

	@Mutation({ input: factDecisionInput })
	async decideFact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof factDecisionInput>,
	) {
		return this.contacts.decideFact(ctx.organizationId, input, ctx.user.id);
	}
}

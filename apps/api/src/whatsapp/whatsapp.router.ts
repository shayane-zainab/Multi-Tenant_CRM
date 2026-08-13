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
	connectInput,
	connectionInput,
	sendInput,
	setWhatsAppAutoCreateInput,
	threadsInput,
	whatsAppThreadInput,
} from "./whatsapp.contracts";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

@Router({ alias: "whatsapp" })
@UseMiddlewares(AuthMiddleware)
export class WhatsAppRouter {
	constructor(
		@Inject(WhatsAppConnectionService)
		private readonly connections: WhatsAppConnectionService,
	) {}

	@Query()
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connections.status(ctx.organizationId, ctx.user.id);
	}

	@Mutation({ input: connectInput })
	async connect(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof connectInput>,
	) {
		return this.connections.connect(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation()
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connections.purgeSyncedData(ctx.organizationId, ctx.user.id);
	}

	@Mutation({ input: connectionInput })
	async disconnect(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("connectionId") connectionId: string,
	) {
		return this.connections.disconnect(
			ctx.organizationId,
			ctx.user.id,
			connectionId,
		);
	}

	@Mutation({ input: setWhatsAppAutoCreateInput })
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setWhatsAppAutoCreateInput>,
	) {
		return this.connections.setAutoCreate(
			ctx.organizationId,
			ctx.user.id,
			input.connectionId,
			input.enabled,
		);
	}

	@Query({ input: threadsInput })
	async threads(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof threadsInput>,
	) {
		return this.connections.threads(ctx.organizationId, input);
	}

	@Query({ input: whatsAppThreadInput })
	async thread(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof whatsAppThreadInput>,
	) {
		return this.connections.thread(
			ctx.organizationId,
			input.threadId,
			input.take,
		);
	}

	@Mutation({ input: sendInput })
	async send(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendInput>,
	) {
		return this.connections.send(ctx.organizationId, ctx.user.id, input);
	}
}

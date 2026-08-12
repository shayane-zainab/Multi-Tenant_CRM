import { Inject } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext, BaseTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { createMcpKeyInput, revokeMcpKeyInput } from "./mcp.contracts";
import { McpKeysService } from "./mcp-keys.service";

function headersOf(ctx: BaseTrpcContext): Headers {
	return fromNodeHeaders(ctx.req?.headers ?? {});
}

@Router({ alias: "mcpKeys" })
@UseMiddlewares(AuthMiddleware)
export class McpKeysRouter {
	constructor(@Inject(McpKeysService) private readonly keys: McpKeysService) {}

	@Query()
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.keys.settings(ctx.organizationId, ctx.user.id);
	}

	@Mutation({ input: createMcpKeyInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createMcpKeyInput>,
	) {
		return this.keys.create(
			ctx.organizationId,
			ctx.user.id,
			headersOf(ctx),
			input,
		);
	}

	@Mutation({ input: revokeMcpKeyInput })
	async revoke(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revokeMcpKeyInput>,
	) {
		return this.keys.revoke(
			ctx.organizationId,
			ctx.user.id,
			headersOf(ctx),
			input,
		);
	}
}

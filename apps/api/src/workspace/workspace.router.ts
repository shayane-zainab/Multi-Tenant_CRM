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
	inviteMemberInput,
	memberListInput,
	revokeInvitationInput,
	setMemberRoleInput,
	updateWorkspaceInput,
} from "./workspace.contracts";
import { WorkspaceService } from "./workspace.service";

@Router({ alias: "workspace" })
@UseMiddlewares(AuthMiddleware)
export class WorkspaceRouter {
	constructor(
		@Inject(WorkspaceService) private readonly workspace: WorkspaceService,
	) {}

	@Query()
	async get(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.get(ctx.organizationId, ctx.user.id);
	}

	@Query({ input: memberListInput })
	async members(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof memberListInput>,
	) {
		return this.workspace.members(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: updateWorkspaceInput })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateWorkspaceInput>,
	) {
		return this.workspace.update(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: setMemberRoleInput })
	async setMemberRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setMemberRoleInput>,
	) {
		return this.workspace.setMemberRole(ctx.organizationId, ctx.user.id, input);
	}

	@Query()
	async invitations(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.invitations(ctx.organizationId, ctx.user.id);
	}

	@Mutation({ input: inviteMemberInput })
	async invite(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof inviteMemberInput>,
	) {
		return this.workspace.invite(ctx.organizationId, ctx.user.id, input);
	}

	@Mutation({ input: revokeInvitationInput })
	async revokeInvitation(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revokeInvitationInput>,
	) {
		return this.workspace.revokeInvitation(
			ctx.organizationId,
			ctx.user.id,
			input,
		);
	}
}

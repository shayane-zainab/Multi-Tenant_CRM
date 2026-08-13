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
import { setAgentModelInput, setResearchKeyInput } from "./settings.contracts";
import { SettingsService } from "./settings.service";

@Router({ alias: "settings" })
@UseMiddlewares(AuthMiddleware)
export class SettingsRouter {
	constructor(
		@Inject(SettingsService) private readonly settings: SettingsService,
	) {}

	@Query()
	async agentModel(@Ctx() { organizationId }: AuthedTrpcContext) {
		return this.settings.agentModel(organizationId);
	}

	@Query()
	async modelCatalog() {
		return this.settings.modelCatalog();
	}

	@Mutation({ input: setAgentModelInput })
	async setAgentModel(
		@Ctx() { organizationId }: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentModelInput>,
	) {
		return this.settings.setAgentModel(organizationId, input.modelId);
	}

	@Query()
	async researchKey(@Ctx() { organizationId }: AuthedTrpcContext) {
		return this.settings.researchKey(organizationId);
	}

	@Mutation({ input: setResearchKeyInput })
	async setResearchKey(
		@Ctx() { organizationId }: AuthedTrpcContext,
		@Input() input: z.infer<typeof setResearchKeyInput>,
	) {
		return this.settings.setResearchKey(organizationId, input.apiKey);
	}
}

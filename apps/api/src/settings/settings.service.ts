import type { Db } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	maskKey,
	readAgentModel,
	readContextDevKey,
	writeAgentModel,
	writeContextDevKey,
} from "@crm/db/settings";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ResearchKeyService } from "../agent/research-key.service";
import { BackfillService } from "../backfill/backfill.service";
import { InjectDatabase } from "../database/database.constants";
import {
	type CatalogModel,
	ModelCatalogService,
} from "./model-catalog.service";

export interface AgentModelSettings {
	selectedId: string | null;
	effectiveId: string;
	defaultId: string;
	effective: CatalogModel | null;
	updatedAt: string | null;
}

export interface ModelCatalogResult {
	models: CatalogModel[];
	available: boolean;
}

export interface ResearchKeySettings {
	configured: boolean;
	hint: string | null;
}

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly catalog: ModelCatalogService,
		private readonly researchKeys: ResearchKeyService,
		private readonly backfill: BackfillService,
	) {}

	async agentModel(organizationId: string): Promise<AgentModelSettings> {
		const [model, row] = await Promise.all([
			readAgentModel(this.db, organizationId),
			this.db.orgSetting.findFirst({ where: { organizationId }, select: { updatedAt: true } }),
		]);

		return {
			selectedId: model.isDefault ? null : model.id,
			effectiveId: model.id,
			defaultId: DEFAULT_AGENT_MODEL.id,
			effective: await this.catalog.find(model.id),
			updatedAt: row?.updatedAt.toISOString() ?? null,
		};
	}

	async setAgentModel(organizationId: string, modelId: string | null): Promise<AgentModelSettings> {
		if (modelId === null) {
			await writeAgentModel(this.db, organizationId, null);
			this.logger.log({ message: "Agent model reset to the default", organizationId });
			return this.agentModel(organizationId);
		}

		const models = await this.catalog.models();

		if (!models) {
			throw new BadRequestException(
				"Could not reach the AI Gateway to check that model. Try again in a moment.",
			);
		}

		const chosen = models.find((model) => model.id === modelId);

		if (!chosen) {
			throw new BadRequestException(
				`The AI Gateway does not serve a tool-using model called "${modelId}".`,
			);
		}

		await writeAgentModel(this.db, organizationId, {
			id: chosen.id,
			contextWindowTokens: chosen.contextWindowTokens,
		});

		this.logger.log({ message: "Agent model changed", modelId: chosen.id, organizationId });

		return this.agentModel(organizationId);
	}

	async modelCatalog(): Promise<ModelCatalogResult> {
		const models = await this.catalog.models();
		return { models: models ?? [], available: models !== null };
	}

	async researchKey(organizationId: string): Promise<ResearchKeySettings> {
		const key = await readContextDevKey(this.db, organizationId);

		return { configured: key !== null, hint: key ? maskKey(key) : null };
	}

	async setResearchKey(organizationId: string, apiKey: string): Promise<ResearchKeySettings> {
		const check = await this.researchKeys.verify(apiKey);

		if (check.outcome === "invalid") {
			throw new BadRequestException(check.reason);
		}

		await writeContextDevKey(this.db, organizationId, apiKey);

		this.logger.log({
			message: "Context key saved",
			verified: check.outcome === "valid",
			organizationId,
		});

		// Every company added while there was no key is still PENDING, because a
		// brand task with nowhere to look leaves the record alone. The sign-in
		// sweep would find them, but the person who just fixed it is standing
		// here — so pick the work up now rather than on their next sign-in.
		void this.backfill
			.run(organizationId, "companies")
			.then(({ queued, remaining }) => {
				if (queued > 0) {
					this.logger.log({
						message: "Queued the research that was waiting on a key",
						queued,
						remaining,
						organizationId,
					});
				}
			})
			.catch((error: unknown) => {
				this.logger.warn(
					{ message: "Could not queue the waiting research", organizationId },
					error instanceof Error ? error.stack : String(error),
				);
			});

		return this.researchKey(organizationId);
	}
}

import { Global, Module } from "@nestjs/common";
import { ActivityStampService } from "./activity-stamp.service";
import { EnrichmentLogService } from "./enrichment-log.service";
import { LeadVisibilityService } from "./lead-visibility.service";

@Global()
@Module({
	providers: [
		ActivityStampService,
		EnrichmentLogService,
		LeadVisibilityService,
	],
	exports: [ActivityStampService, EnrichmentLogService, LeadVisibilityService],
})
export class CrmModule {}

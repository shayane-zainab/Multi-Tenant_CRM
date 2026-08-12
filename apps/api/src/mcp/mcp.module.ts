import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { DealsModule } from "../deals/deals.module";
import { SearchModule } from "../search/search.module";
import { TrpcModule } from "../trpc/trpc.module";
import { McpController } from "./mcp.controller";
import { McpIdentityService } from "./mcp-identity.service";
import { McpKeysRouter } from "./mcp-keys.router";
import { McpKeysService } from "./mcp-keys.service";
import { McpToolsService } from "./mcp-tools.service";

@Module({
	imports: [
		TrpcModule,
		CompaniesModule,
		ContactsModule,
		DealsModule,
		ActivitiesModule,
		SearchModule,
		DashboardModule,
	],
	controllers: [McpController],
	providers: [
		McpIdentityService,
		McpToolsService,
		McpKeysService,
		McpKeysRouter,
	],
})
export class McpModule {}

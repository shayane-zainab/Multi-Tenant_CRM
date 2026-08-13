import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { WhatsAppClient } from "./whatsapp.client";
import { WhatsAppConfig } from "./whatsapp.config";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppRouter } from "./whatsapp.router";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppMatchService } from "./whatsapp-match.service";
import { WhatsAppSyncService } from "./whatsapp-sync.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [WhatsAppController],
	providers: [
		WhatsAppConfig,
		WhatsAppClient,
		WhatsAppMatchService,
		WhatsAppSyncService,
		WhatsAppConnectionService,
		WhatsAppRouter,
	],
	exports: [WhatsAppSyncService, WhatsAppConnectionService],
})
export class WhatsAppModule {}

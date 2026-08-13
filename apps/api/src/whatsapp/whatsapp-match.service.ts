import { type Db, RecordSource } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { EnrichmentLogService } from "../crm/enrichment-log.service";
import { InjectDatabase } from "../database/database.constants";
import {
	displayPhone,
	normalizePhone,
	phoneVariants,
	splitProfileName,
} from "./phone";

export type MatchResult = {
	contactId: string | null;
	companyId: string | null;
	created: boolean;
};

@Injectable()
export class WhatsAppMatchService {
	private readonly logger = new Logger(WhatsAppMatchService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly log: EnrichmentLogService,
	) {}

	async resolve(input: {
		organizationId: string;
		waId: string;
		profileName: string | null;
		allowCreate: boolean;
		ownerId: string;
	}): Promise<MatchResult> {
		const existing = await this.find(input.organizationId, input.waId);

		if (existing) {
			return {
				contactId: existing.id,
				companyId: existing.companyId,
				created: false,
			};
		}

		if (!input.allowCreate) {
			return { contactId: null, companyId: null, created: false };
		}

		return this.create(input);
	}

	async find(
		organizationId: string,
		waId: string,
	): Promise<{ id: string; companyId: string | null } | null> {
		const variants = phoneVariants(waId);
		if (variants.length === 0) return null;

		return this.db.contact.findFirst({
			where: { organizationId, phone: { in: variants } },
			select: { id: true, companyId: true },
			orderBy: { createdAt: "asc" },
		});
	}

	private async create(input: {
		organizationId: string;
		waId: string;
		profileName: string | null;
		ownerId: string;
	}): Promise<MatchResult> {
		const phone = normalizePhone(input.waId);
		if (!phone) return { contactId: null, companyId: null, created: false };

		const suppressed = await this.db.suppressedPhone.findFirst({
			where: { phone, organizationId: input.organizationId },
			select: { phone: true },
		});

		if (suppressed) {
			this.logger.debug({
				message: "WhatsApp contact not created — the rep deleted this number",
				organizationId: input.organizationId,
			});
			return { contactId: null, companyId: null, created: false };
		}

		const { firstName, lastName } = splitProfileName(
			input.profileName,
			input.waId,
		);

		const contact = await this.db.contact.create({
			data: {
				organizationId: input.organizationId,
				firstName,
				lastName,
				phone,
				source: RecordSource.WHATSAPP,
				ownerId: input.ownerId,
			},
			select: { id: true, companyId: true },
		});

		await this.log.record(input.organizationId, {
			contactId: contact.id,
			subject: "Contact added from WhatsApp",
			body: `${displayPhone(input.waId)} messaged on WhatsApp.`,
			meta: { source: RecordSource.WHATSAPP, waId: input.waId },
		});

		await this.agent.contactCreated(
			input.organizationId,
			contact.id,
			input.profileName
				? `Messaged on WhatsApp as "${input.profileName}", with only a phone number on the record`
				: "Messaged on WhatsApp from a number with no name on it",
		);

		this.logger.log({
			message: "Contact auto-created from WhatsApp",
			contactId: contact.id,
			organizationId: input.organizationId,
		});

		return {
			contactId: contact.id,
			companyId: contact.companyId,
			created: true,
		};
	}
}

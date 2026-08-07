import type { Db } from "./client";
import {
	DEFAULT_REPORTING_CURRENCY,
	isCurrencyCode,
	normalizeCurrency,
} from "./currency";

export const DEFAULT_AGENT_MODEL = {
	id: "zai/glm-5.2-fast",
	contextWindowTokens: 1_000_000,
} as const;

export interface AgentModelSetting {
	id: string;
	contextWindowTokens: number;
	isDefault: boolean;
}

export async function readAgentModel(
	db: Db,
	organizationId: string,
): Promise<AgentModelSetting> {
	const row = await db.orgSetting.findUnique({
		where: { organizationId },
		select: { agentModelId: true, agentModelContextWindow: true },
	});

	if (!row?.agentModelId) {
		return { ...DEFAULT_AGENT_MODEL, isDefault: true };
	}

	return {
		id: row.agentModelId,
		contextWindowTokens:
			row.agentModelContextWindow ?? DEFAULT_AGENT_MODEL.contextWindowTokens,
		isDefault: false,
	};
}

export async function writeAgentModel(
	db: Db,
	organizationId: string,
	model: { id: string; contextWindowTokens: number } | null,
): Promise<void> {
	const fields = {
		agentModelId: model?.id ?? null,
		agentModelContextWindow: model?.contextWindowTokens ?? null,
	};

	await db.orgSetting.upsert({
		where: { organizationId },
		create: { organizationId, ...fields },
		update: fields,
	});
}

export const CONTEXT_DEV_SIGNUP_URL = "https://link.context.dev/crm";

export const CONTEXT_DEV_DISCOUNT_CODE = "CRM";

export async function readContextDevKey(
	db: Db,
	organizationId: string,
): Promise<string | null> {
	const row = await db.orgSetting.findUnique({
		where: { organizationId },
		select: { contextDevApiKey: true },
	});

	return row?.contextDevApiKey?.trim() || null;
}

export async function writeContextDevKey(
	db: Db,
	organizationId: string,
	key: string,
): Promise<void> {
	const contextDevApiKey = key.trim();

	await db.orgSetting.upsert({
		where: { organizationId },
		create: { organizationId, contextDevApiKey },
		update: { contextDevApiKey },
	});
}

export async function readReportingCurrency(
	db: Db,
	organizationId: string,
): Promise<string> {
	const row = await db.orgSetting.findUnique({
		where: { organizationId },
		select: { reportingCurrency: true },
	});

	const stored = normalizeCurrency(row?.reportingCurrency);

	return isCurrencyCode(stored) ? stored : DEFAULT_REPORTING_CURRENCY;
}

export async function writeReportingCurrency(
	db: Db,
	organizationId: string,
	code: string,
): Promise<string> {
	const reportingCurrency = normalizeCurrency(code);

	await db.orgSetting.upsert({
		where: { organizationId },
		create: { organizationId, reportingCurrency },
		update: { reportingCurrency },
	});

	return reportingCurrency;
}

export async function readRatesRefreshedAt(
	db: Db,
	organizationId: string,
): Promise<Date | null> {
	const row = await db.orgSetting.findUnique({
		where: { organizationId },
		select: { ratesRefreshedAt: true },
	});

	return row?.ratesRefreshedAt ?? null;
}

export async function writeRatesRefreshedAt(
	db: Db,
	organizationId: string,
	ratesRefreshedAt: Date,
): Promise<void> {
	await db.orgSetting.upsert({
		where: { organizationId },
		create: { organizationId, ratesRefreshedAt },
		update: { ratesRefreshedAt },
	});
}

export function maskKey(key: string): string {
	const trimmed = key.trim();
	return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : "••••";
}

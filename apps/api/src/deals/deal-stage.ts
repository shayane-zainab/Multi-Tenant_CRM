import { DealStage, type Prisma, StageKind } from "@crm/db";

export const OPEN_DEAL_STAGES = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
] as const;

export const CLOSED_DEAL_STAGES = [
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

export const LOSING_DEAL_STAGES = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

const CLOSED = new Set<DealStage>(CLOSED_DEAL_STAGES);

export function isClosedStage(stage: DealStage): boolean {
	return CLOSED.has(stage);
}

export const CLOSED_KINDS = [StageKind.WON, StageKind.LOST] as const;

export function isClosedKind(kind: StageKind): boolean {
	return kind === StageKind.WON || kind === StageKind.LOST;
}

export function isLosingKind(kind: StageKind): boolean {
	return kind === StageKind.LOST;
}

export const OPEN_DEALS: Prisma.DealWhereInput = {
	NOT: {
		pipelineStage: {
			kind: { in: [StageKind.LEAD, StageKind.WON, StageKind.LOST] },
		},
	},
};

export const CLOSED_DEALS: Prisma.DealWhereInput = {
	pipelineStage: { kind: { in: [...CLOSED_KINDS] } },
};

export function legacyStageFor(kind: StageKind): DealStage {
	switch (kind) {
		case StageKind.WON:
			return DealStage.CLOSED_WON;
		case StageKind.LOST:
			return DealStage.CLOSED_LOST;
		case StageKind.LEAD:
			return DealStage.DEMO_BOOKED;
		default:
			return DealStage.QUALIFIED_TO_BUY;
	}
}

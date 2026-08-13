import { normalizePhone } from "../crm/phone";

export { normalizePhone };

export function phoneVariants(waId: string): string[] {
	const normalized = normalizePhone(waId);
	if (!normalized) return [];

	const digits = normalized.slice(1);

	return [...new Set([normalized, digits, `+${digits}`, `00${digits}`])];
}

export function samePhone(
	left: string | null | undefined,
	right: string | null | undefined,
): boolean {
	const a = normalizePhone(left);
	const b = normalizePhone(right);

	return a !== null && a === b;
}

export function displayPhone(waId: string): string {
	return normalizePhone(waId) ?? waId;
}

export function splitProfileName(
	profileName: string | null,
	waId: string,
): { firstName: string; lastName: string | null } {
	const trimmed = profileName?.trim().replace(/\s+/g, " ");

	if (!trimmed) return { firstName: displayPhone(waId), lastName: null };

	const parts = trimmed.split(" ");
	const first = parts[0] ?? trimmed;
	const rest = parts.slice(1).join(" ");

	return { firstName: first, lastName: rest === "" ? null : rest };
}

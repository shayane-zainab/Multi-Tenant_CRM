const MIN_DIGITS = 7;

const MAX_DIGITS = 15;

export function normalizePhone(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	const digits = trimmed.replace(/\D/g, "");
	if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;

	return `+${digits}`;
}

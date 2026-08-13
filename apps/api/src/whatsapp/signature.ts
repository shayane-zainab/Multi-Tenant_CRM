import { createHmac, timingSafeEqual } from "node:crypto";
import { SIGNATURE_PREFIX } from "./whatsapp.constants";

export function signBody(body: Buffer, appSecret: string): string {
	return `${SIGNATURE_PREFIX}${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

export function verifySignature(
	body: Buffer,
	header: string | undefined,
	appSecret: string,
): boolean {
	if (!header || !appSecret) return false;
	if (!header.startsWith(SIGNATURE_PREFIX)) return false;

	const expected = Buffer.from(signBody(body, appSecret), "utf8");
	const received = Buffer.from(header, "utf8");

	if (expected.length !== received.length) return false;

	return timingSafeEqual(expected, received);
}

export function verifyChallenge(
	query: Record<string, unknown>,
	verifyToken: string,
): string | null {
	const mode = query["hub.mode"];
	const token = query["hub.verify_token"];
	const challenge = query["hub.challenge"];

	if (mode !== "subscribe") return null;
	if (typeof token !== "string" || typeof challenge !== "string") return null;

	const expected = Buffer.from(verifyToken, "utf8");
	const received = Buffer.from(token, "utf8");

	if (expected.length !== received.length) return null;
	if (!timingSafeEqual(expected, received)) return null;

	return challenge;
}

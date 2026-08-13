import { describe, expect, it } from "bun:test";
import {
	signBody,
	verifyChallenge,
	verifySignature,
} from "../src/whatsapp/signature";

const SECRET = "an-app-secret-from-the-meta-dashboard";

const BODY = Buffer.from(
	JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
	"utf8",
);

describe("verifySignature", () => {
	it("accepts a body signed with the app secret", () => {
		expect(verifySignature(BODY, signBody(BODY, SECRET), SECRET)).toBe(true);
	});

	it("rejects a body that was altered after signing", () => {
		const signature = signBody(BODY, SECRET);
		const tampered = Buffer.from(`${BODY.toString("utf8")} `, "utf8");

		expect(verifySignature(tampered, signature, SECRET)).toBe(false);
	});

	it("rejects a signature made with a different secret", () => {
		expect(
			verifySignature(BODY, signBody(BODY, "somebody-elses-secret"), SECRET),
		).toBe(false);
	});

	it("rejects a missing, unprefixed or truncated header", () => {
		const signature = signBody(BODY, SECRET);

		expect(verifySignature(BODY, undefined, SECRET)).toBe(false);
		expect(verifySignature(BODY, signature.slice(7), SECRET)).toBe(false);
		expect(verifySignature(BODY, signature.slice(0, -2), SECRET)).toBe(false);
		expect(verifySignature(BODY, "sha256=", SECRET)).toBe(false);
	});

	it("fails closed when no app secret is configured", () => {
		expect(verifySignature(BODY, signBody(BODY, SECRET), "")).toBe(false);
	});
});

describe("verifyChallenge", () => {
	const token = "the-token-typed-into-meta";

	it("echoes the challenge when the token matches", () => {
		const challenge = verifyChallenge(
			{
				"hub.mode": "subscribe",
				"hub.verify_token": token,
				"hub.challenge": "1158201444",
			},
			token,
		);

		expect(challenge).toBe("1158201444");
	});

	it("refuses a wrong token, a wrong mode, or a missing challenge", () => {
		const base = {
			"hub.mode": "subscribe",
			"hub.verify_token": token,
			"hub.challenge": "1158201444",
		};

		expect(
			verifyChallenge({ ...base, "hub.verify_token": "wrong" }, token),
		).toBeNull();
		expect(
			verifyChallenge({ ...base, "hub.mode": "unsubscribe" }, token),
		).toBeNull();
		expect(
			verifyChallenge({ ...base, "hub.challenge": undefined }, token),
		).toBeNull();
		expect(verifyChallenge({}, token)).toBeNull();
	});

	it("does not leak a match through length alone", () => {
		expect(
			verifyChallenge(
				{
					"hub.mode": "subscribe",
					"hub.verify_token": `${token}-longer`,
					"hub.challenge": "1",
				},
				token,
			),
		).toBeNull();
	});
});

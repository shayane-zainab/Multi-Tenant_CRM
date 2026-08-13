import { describe, expect, it } from "bun:test";
import { parseWebhook } from "../src/whatsapp/payload";
import {
	normalizePhone,
	phoneVariants,
	samePhone,
	splitProfileName,
} from "../src/whatsapp/phone";

function envelope(value: Record<string, unknown>, field = "messages") {
	return {
		object: "whatsapp_business_account",
		entry: [{ id: "WABA1", changes: [{ field, value }] }],
	};
}

const metadata = {
	display_phone_number: "15550001111",
	phone_number_id: "PN1",
};

describe("parseWebhook", () => {
	it("reads an inbound text message", () => {
		const [change] = parseWebhook(
			envelope({
				messaging_product: "whatsapp",
				metadata,
				contacts: [{ profile: { name: "Hazim Usa" }, wa_id: "923336104114" }],
				messages: [
					{
						from: "923336104114",
						id: "wamid.AAA",
						timestamp: "1750000000",
						type: "text",
						text: { body: "Okay our lawyer will call you" },
					},
				],
			}),
		);

		expect(change?.phoneNumberId).toBe("PN1");
		expect(change?.profileNames["923336104114"]).toBe("Hazim Usa");
		expect(change?.messages).toHaveLength(1);

		const message = change?.messages[0];
		expect(message?.direction).toBe("INBOUND");
		expect(message?.waId).toBe("923336104114");
		expect(message?.body).toBe("Okay our lawyer will call you");
		expect(message?.sentAt.getTime()).toBe(1750000000 * 1000);
	});

	it("treats a message echo as outbound and threads it by the recipient", () => {
		const [change] = parseWebhook(
			envelope(
				{
					messaging_product: "whatsapp",
					metadata,
					message_echoes: [
						{
							from: "15550001111",
							to: "923336104114",
							id: "wamid.ECHO",
							timestamp: "1750000100",
							type: "text",
							text: { body: "Sent from the phone" },
						},
					],
				},
				"message_echoes",
			),
		);

		const message = change?.messages[0];
		expect(message?.direction).toBe("OUTBOUND");
		expect(message?.waId).toBe("923336104114");
		expect(message?.fromWaId).toBe("15550001111");
	});

	it("keeps media metadata and the caption", () => {
		const [change] = parseWebhook(
			envelope({
				messaging_product: "whatsapp",
				metadata,
				messages: [
					{
						from: "923336104114",
						id: "wamid.IMG",
						timestamp: "1750000200",
						type: "image",
						image: {
							id: "MEDIA1",
							mime_type: "image/jpeg",
							caption: "The signed lease",
						},
					},
				],
			}),
		);

		const message = change?.messages[0];
		expect(message?.kind).toBe("image");
		expect(message?.mediaId).toBe("MEDIA1");
		expect(message?.mediaMime).toBe("image/jpeg");
		expect(message?.caption).toBe("The signed lease");
		expect(message?.body).toBeNull();
	});

	it("reads delivery statuses, including a failure", () => {
		const [change] = parseWebhook(
			envelope({
				messaging_product: "whatsapp",
				metadata,
				statuses: [
					{
						id: "wamid.AAA",
						status: "failed",
						timestamp: "1750000300",
						recipient_id: "923336104114",
						errors: [{ code: 131047, title: "Re-engagement message" }],
					},
				],
			}),
		);

		const status = change?.statuses[0];
		expect(status?.status).toBe("FAILED");
		expect(status?.failedCode).toBe(131047);
		expect(status?.failedTitle).toBe("Re-engagement message");
	});

	it("ignores anything that is not a WhatsApp account event", () => {
		expect(parseWebhook({ object: "page", entry: [] })).toEqual([]);
		expect(parseWebhook(null)).toEqual([]);
		expect(parseWebhook("nonsense")).toEqual([]);
		expect(parseWebhook({ object: "whatsapp_business_account" })).toEqual([]);
	});

	it("drops a change with no phone_number_id rather than throwing", () => {
		const parsed = parseWebhook(
			envelope({
				messaging_product: "whatsapp",
				metadata: {},
				messages: [{ from: "1", id: "x", type: "text", text: { body: "hi" } }],
			}),
		);

		expect(parsed).toEqual([]);
	});

	it("survives malformed messages inside a well-formed envelope", () => {
		const [change] = parseWebhook(
			envelope({
				messaging_product: "whatsapp",
				metadata,
				messages: [
					null,
					"nope",
					{ id: "wamid.NOFROM", type: "text" },
					{
						from: "923336104114",
						id: "wamid.OK",
						timestamp: "1750000400",
						type: "text",
						text: { body: "still here" },
					},
				],
			}),
		);

		expect(change?.messages).toHaveLength(1);
		expect(change?.messages[0]?.waMessageId).toBe("wamid.OK");
	});

	it("falls back to now when the timestamp is unusable", () => {
		const before = Date.now();

		const [change] = parseWebhook(
			envelope({
				messaging_product: "whatsapp",
				metadata,
				messages: [
					{ from: "1234567", id: "wamid.T", type: "text", text: { body: "x" } },
				],
			}),
		);

		const sentAt = change?.messages[0]?.sentAt.getTime() ?? 0;
		expect(sentAt).toBeGreaterThanOrEqual(before);
	});
});

describe("normalizePhone", () => {
	it("reduces anything a human or Meta might send to E.164", () => {
		for (const input of [
			"923336104114",
			"+92 333 6104114",
			"+92-333-6104114",
			"(92) 333 6104114",
		]) {
			expect(normalizePhone(input)).toBe("+923336104114");
		}
	});

	it("rejects values that cannot be a number", () => {
		for (const input of ["", "   ", "abc", "12345", null, undefined]) {
			expect(normalizePhone(input)).toBeNull();
		}
	});

	it("matches across formats", () => {
		expect(samePhone("+923336104114", "923336104114")).toBe(true);
		expect(samePhone("+923336104114", "+923336104115")).toBe(false);
		expect(samePhone(null, null)).toBe(false);
	});

	it("offers the variants a contact row might have been saved as", () => {
		const variants = phoneVariants("923336104114");

		expect(variants).toContain("+923336104114");
		expect(variants).toContain("923336104114");
		expect(variants).toContain("00923336104114");
	});
});

describe("splitProfileName", () => {
	it("splits a WhatsApp profile name into first and last", () => {
		expect(splitProfileName("Ahmad Bilal", "923336104114")).toEqual({
			firstName: "Ahmad",
			lastName: "Bilal",
		});
	});

	it("keeps a single-word name whole", () => {
		expect(splitProfileName("Hazim", "923336104114")).toEqual({
			firstName: "Hazim",
			lastName: null,
		});
	});

	it("falls back to the number when there is no profile name", () => {
		expect(splitProfileName(null, "923336104114")).toEqual({
			firstName: "+923336104114",
			lastName: null,
		});
	});
});

import { z } from "zod";
import { TEXT_LIMIT } from "./whatsapp.constants";

export const connectInput = z.object({
	phoneNumberId: z.string().trim().min(1).max(64),
	wabaId: z.string().trim().min(1).max(64).optional(),
	displayPhone: z.string().trim().min(1).max(32).optional(),
	accessToken: z.string().trim().min(1).max(512).optional(),
});

export const connectionInput = z.object({
	connectionId: z.string().min(1),
});

export const setWhatsAppAutoCreateInput = z.object({
	connectionId: z.string().min(1),
	enabled: z.boolean(),
});

export const threadsInput = z.object({
	contactId: z.string().min(1).optional(),
	companyId: z.string().min(1).optional(),
	take: z.number().int().min(1).max(100).default(25),
});

export const whatsAppThreadInput = z.object({
	threadId: z.string().min(1),
	take: z.number().int().min(1).max(200).default(50),
});

export const sendInput = z.object({
	threadId: z.string().min(1),
	body: z.string().trim().min(1).max(TEXT_LIMIT),
});

export type ConnectInput = z.infer<typeof connectInput>;
export type SendInput = z.infer<typeof sendInput>;

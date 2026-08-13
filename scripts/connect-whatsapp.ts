import { db } from "@crm/db";

function usage(): never {
	console.error(
		[
			"Usage: bun run scripts/connect-whatsapp.ts <orgSlug> <phoneNumberId> <accessToken> [displayPhone]",
			"",
			"  orgSlug        The workspace slug, as it appears in the URL.",
			"  phoneNumberId  Meta → WhatsApp → API setup → Phone number ID.",
			"  accessToken    A permanent System User token scoped to that client's WABA.",
			"  displayPhone   Optional, cosmetic. The number in any format.",
			"",
			"The owner is the oldest member of the workspace. Auto-create stays off;",
			"turn it on from Settings → Connections once the rep has seen it working.",
		].join("\n"),
	);
	process.exit(1);
}

async function main() {
	const [slug, phoneNumberId, accessToken, displayPhone] =
		process.argv.slice(2);

	if (!slug || !phoneNumberId || !accessToken) usage();

	const organization = await db.organization.findUnique({
		where: { slug },
		select: { id: true, name: true },
	});

	if (!organization) {
		console.error(`No workspace with slug "${slug}".`);
		process.exit(1);
	}

	const owner = await db.member.findFirst({
		where: { organizationId: organization.id },
		orderBy: { createdAt: "asc" },
		select: { userId: true, user: { select: { email: true } } },
	});

	if (!owner) {
		console.error(
			`"${organization.name}" has no members yet. Somebody must sign in first.`,
		);
		process.exit(1);
	}

	const taken = await db.whatsAppConnection.findUnique({
		where: { phoneNumberId },
		select: { organizationId: true },
	});

	if (taken && taken.organizationId !== organization.id) {
		console.error(
			`Phone number id ${phoneNumberId} is already connected to another workspace. One number belongs to one workspace.`,
		);
		process.exit(1);
	}

	const connection = await db.whatsAppConnection.upsert({
		where: { phoneNumberId },
		create: {
			organizationId: organization.id,
			ownerId: owner.userId,
			phoneNumberId,
			accessToken,
			displayPhone: displayPhone ?? null,
		},
		update: { accessToken, displayPhone: displayPhone ?? undefined },
		select: { id: true },
	});

	console.log(
		[
			`Connected WhatsApp to ${organization.name}.`,
			`  connection   ${connection.id}`,
			`  number id    ${phoneNumberId}`,
			`  owner        ${owner.user.email}`,
			"",
			"Point Meta's webhook at POST /internal/whatsapp/webhook and subscribe to",
			"both `messages` and `message_echoes`, or replies sent from the phone will",
			"never arrive.",
		].join("\n"),
	);
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => db.$disconnect());

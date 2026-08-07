import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";

async function main() {
	const name = process.argv[2];
	const adminEmail = process.argv[3];
	const website = process.argv[4];

	if (!name || !adminEmail) {
		console.error("Usage: bun run scripts/create-org.ts <name> <adminEmail> [website]");
		process.exit(1);
	}

	const slug = workspaceSlug(name);

	console.log(`Creating organization: ${name} (${slug})`);

	const user = await db.user.findUnique({ where: { email: adminEmail } });
	if (!user) {
		console.error(`User with email ${adminEmail} not found. They must sign in first.`);
		process.exit(1);
	}

	const org = await db.organization.create({
		data: {
			name,
			slug,
			website: website ?? null,
			metadata: {},
			createdAt: new Date(),
		},
	});

	await db.member.create({
		data: {
			organizationId: org.id,
			userId: user.id,
			role: "owner",
			createdAt: new Date(),
		},
	});

	await db.orgSetting.create({
		data: {
			organizationId: org.id,
		},
	});

	console.log(`Successfully created organization ${name} and added ${adminEmail} as owner.`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

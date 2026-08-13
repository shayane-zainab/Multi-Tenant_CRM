import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";

const email = process.argv[2] ?? "dev@localhost";
const name = process.argv[3] ?? "Aristral";

const user = await db.user.findUnique({
	where: { email },
	select: { id: true },
});

if (!user) {
	console.error(`No user ${email}. Run dev:session first.`);
	process.exit(1);
}

const slug = workspaceSlug(name);

const organization =
	(await db.organization.findFirst({
		where: { members: { some: { userId: user.id } } },
		select: { id: true, name: true, slug: true },
	})) ??
	(await db.organization.create({
		data: { id: `org-${slug}`, name, slug, createdAt: new Date() },
		select: { id: true, name: true, slug: true },
	}));

await db.member.upsert({
	where: {
		organizationId_userId: { organizationId: organization.id, userId: user.id },
	},
	create: {
		id: `member-${organization.id}-${user.id}`,
		organizationId: organization.id,
		userId: user.id,
		role: "owner",
		createdAt: new Date(),
	},
	update: { role: "owner" },
});

await db.orgSetting.upsert({
	where: { organizationId: organization.id },
	create: { organizationId: organization.id },
	update: {},
});

const sessions = await db.session.updateMany({
	where: { userId: user.id },
	data: { activeOrganizationId: organization.id },
});

console.log(
	[
		`Workspace  ${organization.name} (${organization.slug})`,
		`Owner      ${email}`,
		`Sessions   ${sessions.count} pointed at it`,
	].join("\n"),
);

await db.$disconnect();

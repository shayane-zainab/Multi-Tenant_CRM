import { sso } from "@better-auth/sso";
import { db } from "@crm/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import { AUTH_COOKIE_PREFIX } from "./cookies";
import { env } from "./env";
import { ensureOrganizationMembership } from "./organization";
import { SYNC_SCOPES } from "./scopes";
import { notifySignedIn } from "./signed-in";

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

if (env.google) {
	socialProviders.google = {
		...env.google,

		scope: [...SYNC_SCOPES],

		accessType: "offline",
	};
}

export const auth = betterAuth({
	appName: "CRM",

	database: prismaAdapter(db, {
		provider: "postgresql",
	}),

	emailAndPassword: {
		enabled: false,
	},

	socialProviders,

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
	},

	advanced: {
		cookiePrefix: AUTH_COOKIE_PREFIX,

		useSecureCookies: env.isProduction,
		...(env.cookieDomain && {
			crossSubDomainCookies: {
				enabled: true,
				domain: env.cookieDomain,
			},
		}),
	},

	trustedOrigins: [...env.trustedOrigins],
	hooks: {},

	plugins: [
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			creatorRole: "owner",

			schema: {
				organization: {
					additionalFields: {
						website: {
							type: "string",
							required: false,
						},
					},
				},
			},
		}),

		sso({
			organizationProvisioning: { disabled: true },
		}),
	],

	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					if (!session.activeOrganizationId) {
						const organizationId = await ensureOrganizationMembership(
							session.userId,
						);
						if (organizationId) {
							session.activeOrganizationId = organizationId;
						}
					}
					return { data: session };
				},
				after: async (session) => {
					const user = await db.user.findUnique({
						where: { id: session.userId },
						select: { id: true, email: true },
					});

					if (user) await notifySignedIn(user);
				},
			},
		},
	},
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];

import type { Db } from "@crm/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	activityCreateInput,
	timelineInput,
} from "../activities/activities.contracts";
import { ActivitiesService } from "../activities/activities.service";
import { companyListInput } from "../companies/companies.contracts";
import { CompaniesService } from "../companies/companies.service";
import { contactListInput } from "../contacts/contacts.contracts";
import { ContactsService } from "../contacts/contacts.service";
import { dashboardSummaryInput } from "../dashboard/dashboard.contracts";
import { DashboardService } from "../dashboard/dashboard.service";
import { InjectDatabase } from "../database/database.constants";
import { dealListInput } from "../deals/deals.contracts";
import { DealsService } from "../deals/deals.service";
import { SearchService } from "../search/search.service";
import type { McpIdentity } from "./mcp-identity.service";

const SERVER_NAME = "crm";

const READ = { readOnlyHint: true, openWorldHint: false } as const;

const WRITE = {
	readOnlyHint: false,
	destructiveHint: false,
	openWorldHint: false,
} as const;

const listShape = {
	q: z.string().optional(),
	page: z.number().int().min(1).optional(),
	pageSize: z.number().int().min(1).max(100).optional(),
	sort: z.string().optional(),
	dir: z.enum(["asc", "desc"]).optional(),
};

const DEAL_STAGES = [
	"DEMO_BOOKED",
	"QUALIFIED_TO_BUY",
	"UNQUALIFIED_TO_BUY",
	"DECISION_MAKER_BOUGHT_IN",
	"CONTRACT_SENT",
	"CLOSED_WON",
	"CLOSED_LOST",
] as const;

function text(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
	};
}

@Injectable()
export class McpToolsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
		private readonly contacts: ContactsService,
		private readonly deals: DealsService,
		private readonly activities: ActivitiesService,
		private readonly search: SearchService,
		private readonly dashboard: DashboardService,
	) {}

	build(identity: McpIdentity): McpServer {
		const { organizationId, userId } = identity;

		const server = new McpServer(
			{ name: SERVER_NAME, version: "1.0.0" },
			{
				instructions:
					"This is the workspace's CRM: companies, the people at them, deals and the activity logged against each. Every tool is already scoped to one workspace — there is no tenant argument to pass and no way to read another workspace. Records cannot be deleted through these tools. Prefer `search` when you have a name and no id.",
			},
		);

		server.registerTool(
			"search",
			{
				title: "Search the CRM",
				description:
					"Free-text search across companies, contacts and deals. Returns ids to pass to the get_* tools.",
				inputSchema: { q: z.string().min(1) },
				annotations: READ,
			},
			async ({ q }) => text(await this.search.quick(organizationId, q)),
		);

		server.registerTool(
			"list_companies",
			{
				title: "List companies",
				description:
					"Companies, filtered and paginated. `owner`, `industry`, `enrichment` and `source` take a facet value or 'all'.",
				inputSchema: {
					...listShape,
					owner: z.string().optional(),
					industry: z.string().optional(),
					enrichment: z.string().optional(),
					source: z.string().optional(),
				},
				annotations: READ,
			},
			async (args) =>
				text(
					await this.companies.list(
						organizationId,
						companyListInput.parse(args),
					),
				),
		);

		server.registerTool(
			"get_company",
			{
				title: "Get a company",
				description:
					"One company in full, including what the research agent has found about it.",
				inputSchema: { id: z.string().min(1) },
				annotations: READ,
			},
			async ({ id }) => text(await this.companies.byId(organizationId, id)),
		);

		server.registerTool(
			"create_company",
			{
				title: "Create a company",
				description:
					"Add a company. Giving the domain lets the research agent enrich it.",
				inputSchema: {
					name: z.string().trim().min(1),
					domain: z.string().trim().optional(),
					ownerId: z.string().nullable().optional(),
				},
				annotations: WRITE,
			},
			async (args) => text(await this.companies.create(organizationId, args)),
		);

		server.registerTool(
			"update_company",
			{
				title: "Update a company",
				description: "Change fields on a company. Only pass what changes.",
				inputSchema: {
					id: z.string().min(1),
					name: z.string().trim().min(1).optional(),
					domain: z.string().optional(),
					website: z.string().optional(),
					description: z.string().optional(),
					industry: z.string().optional(),
					city: z.string().optional(),
					stateCode: z.string().optional(),
					country: z.string().optional(),
					phone: z.string().optional(),
					email: z.string().optional(),
					linkedinUrl: z.string().optional(),
					ownerId: z.string().nullable().optional(),
				},
				annotations: WRITE,
			},
			async ({ id, ...data }) =>
				text(await this.companies.update(organizationId, id, data)),
		);

		server.registerTool(
			"list_contacts",
			{
				title: "List contacts",
				description:
					"People, filtered and paginated. `company` takes a company id or 'all'.",
				inputSchema: {
					...listShape,
					owner: z.string().optional(),
					company: z.string().optional(),
					source: z.string().optional(),
				},
				annotations: READ,
			},
			async (args) =>
				text(
					await this.contacts.list(
						organizationId,
						contactListInput.parse(args),
					),
				),
		);

		server.registerTool(
			"get_contact",
			{
				title: "Get a contact",
				description: "One person in full, with the facts held about them.",
				inputSchema: { id: z.string().min(1) },
				annotations: READ,
			},
			async ({ id }) => text(await this.contacts.byId(organizationId, id)),
		);

		server.registerTool(
			"create_contact",
			{
				title: "Create a contact",
				description: "Add a person, optionally attached to a company.",
				inputSchema: {
					firstName: z.string().trim().min(1),
					lastName: z.string().trim().optional(),
					email: z.string().optional(),
					phone: z.string().trim().optional(),
					title: z.string().trim().optional(),
					companyId: z.string().nullable().optional(),
					ownerId: z.string().nullable().optional(),
				},
				annotations: WRITE,
			},
			async (args) => text(await this.contacts.create(organizationId, args)),
		);

		server.registerTool(
			"update_contact",
			{
				title: "Update a contact",
				description: "Change fields on a person. Only pass what changes.",
				inputSchema: {
					id: z.string().min(1),
					firstName: z.string().trim().min(1).optional(),
					lastName: z.string().optional(),
					email: z.string().optional(),
					phone: z.string().optional(),
					title: z.string().optional(),
					linkedinUrl: z.string().optional(),
					twitterUrl: z.string().optional(),
					githubUrl: z.string().optional(),
					companyId: z.string().nullable().optional(),
					ownerId: z.string().nullable().optional(),
				},
				annotations: WRITE,
			},
			async ({ id, ...data }) =>
				text(await this.contacts.update(organizationId, id, data)),
		);

		server.registerTool(
			"list_deals",
			{
				title: "List deals",
				description:
					"Deals, filtered and paginated. `closing` takes overdue, this-month, next-month, later, none or 'all'.",
				inputSchema: {
					...listShape,
					status: z.string().optional(),
					owner: z.string().optional(),
					stage: z.string().optional(),
					closing: z.string().optional(),
				},
				annotations: READ,
			},
			async (args) =>
				text(await this.deals.list(organizationId, dealListInput.parse(args))),
		);

		server.registerTool(
			"get_deal",
			{
				title: "Get a deal",
				description: "One deal in full, with its company and contacts.",
				inputSchema: { id: z.string().min(1) },
				annotations: READ,
			},
			async ({ id }) => text(await this.deals.byId(organizationId, id)),
		);

		server.registerTool(
			"create_deal",
			{
				title: "Create a deal",
				description:
					"Open a deal against a company. `amountCents` is minor units — £1,500 is 150000. Owner must be a workspace member; use list_workspace_members.",
				inputSchema: {
					name: z.string().trim().min(1),
					companyId: z.string().min(1),
					ownerId: z.string().min(1),
					stage: z.enum(DEAL_STAGES).optional(),
					amountCents: z.number().int().min(0).nullable().optional(),
					currency: z.string().length(3).optional(),
					expectedCloseDate: z.string().nullable().optional(),
				},
				annotations: WRITE,
			},
			async (args) => text(await this.deals.create(organizationId, args)),
		);

		server.registerTool(
			"update_deal",
			{
				title: "Update a deal",
				description:
					"Change fields on a deal. Use set_deal_stage to move it through the pipeline.",
				inputSchema: {
					id: z.string().min(1),
					name: z.string().trim().min(1).optional(),
					description: z.string().nullable().optional(),
					companyId: z.string().optional(),
					ownerId: z.string().optional(),
					amountCents: z.number().int().min(0).nullable().optional(),
					currency: z.string().length(3).optional(),
					expectedCloseDate: z.string().nullable().optional(),
				},
				annotations: WRITE,
			},
			async ({ id, ...data }) =>
				text(await this.deals.update(organizationId, id, data)),
		);

		server.registerTool(
			"set_deal_stage",
			{
				title: "Move a deal",
				description:
					"Move a deal to a stage. Closing one as lost wants a closedReason.",
				inputSchema: {
					id: z.string().min(1),
					stage: z.enum(DEAL_STAGES),
					closedReason: z.string().trim().optional(),
				},
				annotations: WRITE,
			},
			async (args) =>
				text(await this.deals.setStage(organizationId, args, userId)),
		);

		server.registerTool(
			"list_activities",
			{
				title: "Read a timeline",
				description:
					"Activity against one company, contact or deal — notes, calls, emails, meetings and tasks. Pass exactly one id.",
				inputSchema: {
					companyId: z.string().optional(),
					contactId: z.string().optional(),
					dealId: z.string().optional(),
					filter: z
						.enum([
							"all",
							"history",
							"notes",
							"upcoming",
							"done",
							"email",
							"meetings",
						])
						.optional(),
					cursor: z.string().optional(),
					limit: z.number().int().min(1).max(100).optional(),
				},
				annotations: READ,
			},
			async (args) =>
				text(
					await this.activities.timeline(
						organizationId,
						timelineInput.parse(args),
					),
				),
		);

		server.registerTool(
			"log_activity",
			{
				title: "Log an activity",
				description:
					"Record a note, call, email, meeting or task against a company, contact or deal. A TASK needs a subject and takes a dueAt.",
				inputSchema: {
					type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING", "TASK"]),
					subject: z.string().trim().optional(),
					body: z.string().trim().optional(),
					occurredAt: z.string().optional(),
					dueAt: z.string().nullable().optional(),
					companyId: z.string().optional(),
					contactId: z.string().optional(),
					dealId: z.string().optional(),
				},
				annotations: WRITE,
			},
			async (args) =>
				text(
					await this.activities.create(
						organizationId,
						activityCreateInput.parse(args),
						userId,
					),
				),
		);

		server.registerTool(
			"complete_task",
			{
				title: "Complete a task",
				description: "Tick a task off, or put it back with completed: false.",
				inputSchema: {
					id: z.string().min(1),
					completed: z.boolean().optional(),
				},
				annotations: WRITE,
			},
			async ({ id, completed }) =>
				text(
					await this.activities.complete(organizationId, id, completed ?? true),
				),
		);

		server.registerTool(
			"my_tasks",
			{
				title: "Tasks owned by this key",
				description:
					"Open tasks belonging to the person this key was created by.",
				inputSchema: {
					window: z.enum(["overdue", "upcoming", "all"]).optional(),
					limit: z.number().int().min(1).max(100).optional(),
				},
				annotations: READ,
			},
			async ({ window, limit }) =>
				text(
					await this.activities.myTasks(
						organizationId,
						{ window: window ?? "all", limit: limit ?? 25 },
						userId,
					),
				),
		);

		server.registerTool(
			"pipeline_summary",
			{
				title: "Pipeline summary",
				description:
					"Headline numbers: open pipeline, what is closing, what has been won.",
				inputSchema: { scope: z.enum(["me", "everyone"]).optional() },
				annotations: READ,
			},
			async (args) =>
				text(
					await this.dashboard.summary(
						organizationId,
						userId,
						dashboardSummaryInput.parse(args),
					),
				),
		);

		server.registerTool(
			"list_workspace_members",
			{
				title: "List workspace members",
				description:
					"The people records can be owned by. Use these ids for ownerId.",
				inputSchema: {},
				annotations: READ,
			},
			async () => text(await this.members(organizationId)),
		);

		return server;
	}

	private async members(organizationId: string) {
		const rows = await this.db.member.findMany({
			where: { organizationId },
			select: {
				role: true,
				user: { select: { id: true, name: true, email: true } },
			},
			orderBy: { createdAt: "asc" },
		});

		return rows.map((row) => ({
			id: row.user.id,
			name: row.user.name,
			email: row.user.email,
			role: row.role,
		}));
	}
}

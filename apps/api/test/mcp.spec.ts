import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Request } from "express";
import { createdByUserId, readKey } from "../src/mcp/key";
import { McpToolsService } from "../src/mcp/mcp-tools.service";

const headers = (values: Record<string, string>) =>
	({ headers: values }) as unknown as Pick<Request, "headers">;

describe("the key a client presents", () => {
	it("is read from either header a client might use", () => {
		expect(readKey(headers({ authorization: "Bearer crm_mcp_abc" }))).toBe(
			"crm_mcp_abc",
		);
		expect(readKey(headers({ authorization: "bearer crm_mcp_abc" }))).toBe(
			"crm_mcp_abc",
		);
		expect(
			readKey(headers({ authorization: "  Bearer   crm_mcp_abc  " })),
		).toBe("crm_mcp_abc");
		expect(readKey(headers({ "x-api-key": " crm_mcp_abc " }))).toBe(
			"crm_mcp_abc",
		);
	});

	it("is nothing at all when the header is missing or empty", () => {
		expect(readKey(headers({}))).toBeNull();
		expect(readKey(headers({ authorization: "Basic abc" }))).toBeNull();
		expect(readKey(headers({ authorization: "Bearer" }))).toBeNull();
		expect(readKey(headers({ "x-api-key": "   " }))).toBeNull();
	});
});

describe("the author stamped on a key", () => {
	it("survives however the store hands the metadata back", () => {
		expect(createdByUserId({ createdByUserId: "user-1" })).toBe("user-1");
		expect(createdByUserId('{"createdByUserId":"user-1"}')).toBe("user-1");
	});

	it("is null rather than a guess when it is not there", () => {
		for (const value of [
			null,
			undefined,
			"",
			"not json",
			"{}",
			{},
			{ createdByUserId: "" },
			{ createdByUserId: 42 },
			[],
		]) {
			expect(createdByUserId(value)).toBeNull();
		}
	});
});

describe("the tools a key can reach", () => {
	const tools = async () => {
		const service = new McpToolsService(
			...(Array(6).fill(null) as ConstructorParameters<typeof McpToolsService>),
		);

		const server = service.build({
			organizationId: "org-1",
			userId: "user-1",
			keyId: "key-1",
		});

		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test", version: "0.0.0" });

		await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

		const listed = await client.listTools();
		await client.close();
		await server.close();

		return listed.tools;
	};

	it("cannot delete a record, by any name", async () => {
		for (const tool of await tools()) {
			expect(tool.name).not.toMatch(/delete|remove|destroy|purge|drop/i);
			expect(tool.annotations?.destructiveHint).not.toBe(true);
		}
	});

	it("says which tools write, so a client can ask first", async () => {
		const listed = await tools();
		const byName = new Map(listed.map((tool) => [tool.name, tool]));

		for (const name of ["search", "get_company", "list_deals", "my_tasks"]) {
			expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true);
		}

		for (const name of [
			"create_company",
			"update_contact",
			"set_deal_stage",
			"log_activity",
		]) {
			expect(byName.get(name)?.annotations?.readOnlyHint).toBe(false);
		}
	});

	it("never opens onto anything but this CRM", async () => {
		for (const tool of await tools()) {
			expect(tool.annotations?.openWorldHint).toBe(false);
		}
	});
});

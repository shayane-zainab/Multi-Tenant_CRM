import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Logger,
	Post,
	Req,
	Res,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { McpIdentityService } from "./mcp-identity.service";
import { McpToolsService } from "./mcp-tools.service";

@Controller("api/mcp")
export class McpController {
	private readonly logger = new Logger(McpController.name);

	constructor(
		private readonly identity: McpIdentityService,
		private readonly tools: McpToolsService,
	) {}

	@Post()
	@AllowAnonymous()
	async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
		const identity = await this.identity.resolve(req);

		const server = this.tools.build(identity);
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});

		res.on("close", () => {
			void transport.close();
			void server.close();
		});

		try {
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			this.logger.error(
				{
					message: "MCP request failed",
					organizationId: identity.organizationId,
					keyId: identity.keyId,
				},
				error instanceof Error ? error.stack : String(error),
			);

			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: { code: -32603, message: "Internal server error" },
					id: null,
				});
			}
		}
	}

	@Get()
	@Delete()
	@AllowAnonymous()
	@HttpCode(405)
	reject() {
		return {
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message:
					"This server is stateless: send each request as a POST. There is no stream to open and no session to end.",
			},
			id: null,
		};
	}
}

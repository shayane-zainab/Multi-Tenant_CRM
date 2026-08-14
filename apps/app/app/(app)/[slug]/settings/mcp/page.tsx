import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { McpKeys } from "./mcp-keys";

export const metadata: Metadata = {
	title: "MCP",
};

export default function McpSettingsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>MCP</PageShellTitle>
					<PageShellDescription>
						Hand an AI assistant a key and it can work in this CRM the way a rep
						does: look things up, add records, log what happened.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Keys />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Keys() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.mcpKeys.settings.queryOptions());

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<McpKeys />
			</div>
		</HydrateClient>
	);
}

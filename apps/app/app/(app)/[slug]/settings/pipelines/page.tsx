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
import { PipelinesManager } from "./pipelines-manager";

export const metadata: Metadata = {
	title: "Pipelines",
};

export default function PipelinesSettingsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Pipelines</PageShellTitle>
					<PageShellDescription>
						The processes your leads move through.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Pipelines />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Pipelines() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const [workspace] = await Promise.all([
		queryClient.fetchQuery(trpc.workspace.get.queryOptions()),
		queryClient.prefetchQuery(trpc.pipelines.list.queryOptions()),
	]);

	return (
		<HydrateClient>
			<PipelinesManager canManage={workspace.canChangeRoles} />
		</HydrateClient>
	);
}

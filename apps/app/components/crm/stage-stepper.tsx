"use client";

import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Stage = RouterOutputs["pipelines"]["list"][number]["stages"][number];

export function StageStepper({
	dealId,
	pipelineId,
	stageId,
}: {
	dealId: string;
	pipelineId: string | null;
	stageId: string | null;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const pipelines = useQuery(trpc.pipelines.list.queryOptions());

	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal(dealId);
				if (result.changed) toast.success("Stage updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const pipeline =
		pipelines.data?.find((row) => row.id === pipelineId) ??
		pipelines.data?.find((row) => row.isDefault) ??
		pipelines.data?.[0];

	if (!pipeline) return null;

	const lost = pipeline.stages.filter((stage) => stage.kind === "LOST");
	const rail: Stage[] = pipeline.stages.filter(
		(stage) => stage.kind !== "LOST",
	);

	const current = pipeline.stages.find((stage) => stage.id === stageId);
	const exited = current?.kind === "LOST";
	const currentIndex = rail.findIndex((stage) => stage.id === stageId);

	const steps = exited ? rail.filter((stage) => stage.kind !== "WON") : rail;

	return (
		<ol className="flex w-full gap-1">
			{steps.map((stage, index) => {
				const reached = !exited && index <= currentIndex;
				const isCurrent = !exited && stage.id === stageId;

				return (
					<li key={stage.id} className="flex min-w-0 flex-1">
						<button
							type="button"
							aria-current={isCurrent ? "step" : undefined}
							disabled={setStage.isPending}
							onClick={() => setStage.mutate({ id: dealId, stageId: stage.id })}
							className={cn(
								"min-w-0 flex-1 border-t-2 pt-2 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-50",
								reached
									? "border-foreground text-foreground"
									: "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
								isCurrent && "font-medium",
							)}
						>
							<span className="block truncate">{stage.name}</span>
						</button>
					</li>
				);
			})}

			{exited && current ? (
				<li className="flex min-w-0 flex-1">
					<span className="min-w-0 flex-1 border-destructive border-t-2 pt-2 text-left font-medium text-destructive text-xs">
						<span className="block truncate">{current.name}</span>
					</span>
				</li>
			) : null}

			{!exited && lost.length > 0 ? (
				<li className="flex min-w-0 flex-1">
					<button
						type="button"
						disabled={setStage.isPending}
						onClick={() => {
							const target = lost[0];
							if (target) {
								setStage.mutate({ id: dealId, stageId: target.id });
							}
						}}
						className="min-w-0 flex-1 border-border border-t-2 pt-2 text-left text-muted-foreground text-xs transition-colors hover:border-destructive hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
					>
						<span className="block truncate">{lost[0]?.name}</span>
					</button>
				</li>
			) : null}
		</ol>
	);
}

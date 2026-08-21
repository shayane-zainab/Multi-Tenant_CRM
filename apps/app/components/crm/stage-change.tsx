"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Pipeline = RouterOutputs["pipelines"]["list"][number];
type Stage = Pipeline["stages"][number];
type Kind = Stage["kind"];

const TONE: Record<Kind, "neutral" | "info" | "success" | "error"> = {
	LEAD: "neutral",
	OPEN: "info",
	WON: "success",
	LOST: "error",
};

const closeReasonParams = {
	closing: parseAsString,
	closingStage: parseAsString,
};

function useStageMutation(onDone?: () => void) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.deal(variables.id);
				onDone?.();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

export function StageLabel({
	name,
	kind,
	className,
}: {
	name: string | null;
	kind: Kind | null;
	className?: string;
}) {
	if (!name || !kind) {
		return <span className={className}>No stage</span>;
	}

	return (
		<StatusIndicator tone={TONE[kind]} label={name} className={className} />
	);
}

export function DealStageMenu({
	dealId,
	pipelineId,
	stageId,
	stageName,
	stageKind,
	variant = "inline",
}: {
	dealId: string;
	pipelineId: string | null;
	stageId: string | null;
	stageName: string | null;
	stageKind: Kind | null;
	variant?: "inline" | "control";
}) {
	const trpc = useTRPC();
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const setStage = useStageMutation();

	const pipelines = useQuery(trpc.pipelines.list.queryOptions());

	const current =
		pipelines.data?.find((row) => row.id === pipelineId) ??
		pipelines.data?.find((row) => row.isDefault) ??
		pipelines.data?.[0];

	const others = pipelines.data?.filter((row) => row.id !== current?.id) ?? [];

	const choose = (stage: Stage) => {
		if (stage.id === stageId) return;

		if (stage.kind === "LOST") {
			void setCloseParams({ closing: dealId, closingStage: stage.id });
			return;
		}

		setStage.mutate({ id: dealId, stageId: stage.id });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{variant === "control" ? (
					<Button
						variant="outline"
						size="sm"
						disabled={setStage.isPending}
						onClick={(event) => event.stopPropagation()}
					>
						<StageLabel
							name={stageName}
							kind={stageKind}
							className="text-foreground"
						/>
						<Icon icon={ChevronDown} className="text-muted-foreground" />
					</Button>
				) : (
					<button
						type="button"
						onClick={(event) => event.stopPropagation()}
						disabled={setStage.isPending}
						className="flex min-w-0 items-center text-left hover:text-foreground disabled:opacity-50"
					>
						<StageLabel name={stageName} kind={stageKind} />
					</button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={variant === "control" ? "end" : "start"}
				className="min-w-52"
				onClick={(event) => event.stopPropagation()}
			>
				{current ? (
					<DropdownMenuRadioGroup
						value={stageId ?? ""}
						onValueChange={(next) => {
							const stage = current.stages.find((row) => row.id === next);
							if (stage) choose(stage);
						}}
					>
						{current.stages.map((stage) => (
							<DropdownMenuRadioItem key={stage.id} value={stage.id}>
								{stage.name}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				) : null}

				{others.map((pipeline) => (
					<div key={pipeline.id}>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>Move to {pipeline.name}</DropdownMenuLabel>
						{pipeline.stages.map((stage) => (
							<DropdownMenuRadioItem
								key={stage.id}
								value={stage.id}
								onSelect={() => choose(stage)}
							>
								{stage.name}
							</DropdownMenuRadioItem>
						))}
					</div>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CloseReasonDialog() {
	const reasonId = useId();
	const [reason, setReason] = useState("");
	const [{ closing, closingStage }, setCloseParams] =
		useQueryStates(closeReasonParams);

	const close = () => {
		setReason("");
		void setCloseParams({ closing: null, closingStage: null });
	};

	const setStage = useStageMutation(close);
	const open = Boolean(closing && closingStage);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Why was it lost?</DialogTitle>
					<DialogDescription>
						A closed-lost deal with no reason teaches nobody anything.
					</DialogDescription>
				</DialogHeader>

				<form
					id="close-reason"
					className="px-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!closing || !closingStage) return;
						setStage.mutate({
							id: closing,
							stageId: closingStage,
							closedReason: reason,
						});
					}}
				>
					<Field>
						<FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
						<Textarea
							id={reasonId}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Went with a competitor on price."
							required
						/>
					</Field>
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={close}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="close-reason"
						disabled={setStage.isPending || reason.trim().length === 0}
					>
						{setStage.isPending ? <Spinner /> : null}
						Mark as lost
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

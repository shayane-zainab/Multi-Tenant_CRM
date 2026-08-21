"use client";

import Add from "@carbon/icons-react/es/Add";
import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import TrashCan from "@carbon/icons-react/es/TrashCan";
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
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Empty } from "@crm/ui/components/empty";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Skeleton } from "@crm/ui/components/skeleton";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Pipeline = RouterOutputs["pipelines"]["list"][number];
type Stage = Pipeline["stages"][number];
type Kind = Stage["kind"];

const KIND_LABEL: Record<Kind, string> = {
	LEAD: "Prospecting",
	OPEN: "Open",
	WON: "Won",
	LOST: "Lost",
};

const KIND_TONE: Record<Kind, "neutral" | "info" | "success" | "error"> = {
	LEAD: "neutral",
	OPEN: "info",
	WON: "success",
	LOST: "error",
};

const KIND_HINT: Record<Kind, string> = {
	LEAD: "Cold prospects. Left out of pipeline value and open deal counts.",
	OPEN: "A live deal. Counts toward pipeline value and forecasts.",
	WON: "Closed and won.",
	LOST: "Closed and lost, or disqualified.",
};

export function PipelinesManager({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const pipelines = useQuery(trpc.pipelines.list.queryOptions());

	const [creating, setCreating] = useState(false);
	const [addingTo, setAddingTo] = useState<Pipeline | null>(null);
	const [renaming, setRenaming] = useState<Pipeline | null>(null);

	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.pipelines.list.queryKey(),
		});
	};

	const fail = (error: { message: string }) => toast.error(error.message);

	const create = useMutation(
		trpc.pipelines.create.mutationOptions({
			onSuccess: async () => {
				setCreating(false);
				await refresh();
				toast.success("Pipeline created.");
			},
			onError: fail,
		}),
	);

	const rename = useMutation(
		trpc.pipelines.rename.mutationOptions({
			onSuccess: async () => {
				setRenaming(null);
				await refresh();
				toast.success("Pipeline renamed.");
			},
			onError: fail,
		}),
	);

	const archive = useMutation(
		trpc.pipelines.archive.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Pipeline archived.");
			},
			onError: fail,
		}),
	);

	const makeDefault = useMutation(
		trpc.pipelines.makeDefault.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Default pipeline changed.");
			},
			onError: fail,
		}),
	);

	const addStage = useMutation(
		trpc.pipelines.addStage.mutationOptions({
			onSuccess: async () => {
				setAddingTo(null);
				await refresh();
			},
			onError: fail,
		}),
	);

	const removeStage = useMutation(
		trpc.pipelines.removeStage.mutationOptions({
			onSuccess: refresh,
			onError: fail,
		}),
	);

	const reorder = useMutation(
		trpc.pipelines.reorderStages.mutationOptions({
			onSuccess: refresh,
			onError: fail,
		}),
	);

	const move = (pipeline: Pipeline, index: number, delta: number) => {
		const ids = pipeline.stages.map((stage) => stage.id);
		const target = index + delta;
		if (target < 0 || target >= ids.length) return;
		const next = [...ids];
		const [held] = next.splice(index, 1);
		if (!held) return;
		next.splice(target, 0, held);
		reorder.mutate({ pipelineId: pipeline.id, stageIds: next });
	};

	if (pipelines.isLoading) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}

	const rows = pipelines.data ?? [];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<p className="text-muted-foreground text-sm">
					Each pipeline has its own stages, so different kinds of lead can be
					worked differently without ever mixing.
				</p>

				{canManage ? (
					<Button onClick={() => setCreating(true)}>
						<Icon icon={Add} />
						New pipeline
					</Button>
				) : null}
			</div>

			{rows.length === 0 ? (
				<Empty title="No pipelines yet" />
			) : (
				<div className="flex flex-col gap-4">
					{rows.map((pipeline) => (
						<section
							key={pipeline.id}
							className="flex flex-col gap-3 rounded-lg border p-4"
						>
							<div className="flex items-center justify-between gap-3">
								<div className="flex min-w-0 flex-col">
									<span className="flex items-center gap-2">
										<span className="truncate font-medium">
											{pipeline.name}
										</span>
										{pipeline.isDefault ? (
											<StatusIndicator tone="neutral" label="Default" />
										) : null}
									</span>
									<span className="text-muted-foreground text-sm">
										{pipeline.stages.length} stages · {pipeline.deals}{" "}
										{pipeline.deals === 1 ? "lead" : "leads"}
									</span>
								</div>

								{canManage ? (
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setAddingTo(pipeline)}
										>
											<Icon icon={Add} />
											Stage
										</Button>

										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="icon">
													<Icon icon={OverflowMenuHorizontal} />
													<span className="sr-only">
														More actions for {pipeline.name}
													</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onSelect={() => setRenaming(pipeline)}
												>
													Rename
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={pipeline.isDefault}
													onSelect={() =>
														makeDefault.mutate({ pipelineId: pipeline.id })
													}
												>
													Make default
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={pipeline.isDefault}
													onSelect={() =>
														archive.mutate({ pipelineId: pipeline.id })
													}
												>
													Archive
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								) : null}
							</div>

							<ol className="flex flex-col gap-2">
								{pipeline.stages.map((stage, index) => (
									<li
										key={stage.id}
										className="flex items-center justify-between gap-3 rounded-md border p-2"
									>
										<span className="flex min-w-0 items-center gap-3">
											<span className="truncate text-sm">{stage.name}</span>
											<StatusIndicator
												tone={KIND_TONE[stage.kind]}
												label={KIND_LABEL[stage.kind]}
											/>
											<span className="text-muted-foreground text-xs">
												{stage.deals} {stage.deals === 1 ? "lead" : "leads"}
											</span>
										</span>

										{canManage ? (
											<span className="flex shrink-0 items-center gap-1">
												<Button
													variant="ghost"
													size="icon"
													disabled={index === 0 || reorder.isPending}
													onClick={() => move(pipeline, index, -1)}
												>
													<Icon icon={ArrowUp} />
													<span className="sr-only">Move {stage.name} up</span>
												</Button>
												<Button
													variant="ghost"
													size="icon"
													disabled={
														index === pipeline.stages.length - 1 ||
														reorder.isPending
													}
													onClick={() => move(pipeline, index, 1)}
												>
													<Icon icon={ArrowDown} />
													<span className="sr-only">
														Move {stage.name} down
													</span>
												</Button>
												<Button
													variant="ghost"
													size="icon"
													disabled={removeStage.isPending}
													onClick={() =>
														removeStage.mutate({ stageId: stage.id })
													}
												>
													<Icon icon={TrashCan} />
													<span className="sr-only">Remove {stage.name}</span>
												</Button>
											</span>
										) : null}
									</li>
								))}
							</ol>
						</section>
					))}
				</div>
			)}

			<PipelineDialog
				open={creating}
				title="New pipeline"
				description="It starts with a usable set of stages. Rename or replace them afterwards."
				confirm="Create pipeline"
				pending={create.isPending}
				onClose={() => setCreating(false)}
				onSubmit={(name) => create.mutate({ name })}
			/>

			<PipelineDialog
				open={renaming !== null}
				title="Rename pipeline"
				description="Only the name changes. Stages and leads stay where they are."
				confirm="Save"
				initial={renaming?.name ?? ""}
				pending={rename.isPending}
				onClose={() => setRenaming(null)}
				onSubmit={(name) => {
					if (renaming) rename.mutate({ pipelineId: renaming.id, name });
				}}
			/>

			<AddStageDialog
				pipeline={addingTo}
				pending={addStage.isPending}
				onClose={() => setAddingTo(null)}
				onSubmit={(name, kind) => {
					if (addingTo)
						addStage.mutate({ pipelineId: addingTo.id, name, kind });
				}}
			/>
		</div>
	);
}

function PipelineDialog({
	open,
	title,
	description,
	confirm,
	initial = "",
	pending,
	onClose,
	onSubmit,
}: {
	open: boolean;
	title: string;
	description: string;
	confirm: string;
	initial?: string;
	pending: boolean;
	onClose: () => void;
	onSubmit: (name: string) => void;
}) {
	const nameId = useId();
	const [name, setName] = useState(initial);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
				else setName(initial);
			}}
		>
			<DialogContent>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit(name.trim());
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor={nameId}>Name</FieldLabel>
						<Input
							id={nameId}
							required
							autoComplete="off"
							placeholder="Real estate"
							defaultValue={initial}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={pending}>
							{confirm}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AddStageDialog({
	pipeline,
	pending,
	onClose,
	onSubmit,
}: {
	pipeline: Pipeline | null;
	pending: boolean;
	onClose: () => void;
	onSubmit: (name: string, kind: Kind) => void;
}) {
	const nameId = useId();
	const kindId = useId();
	const [name, setName] = useState("");
	const [kind, setKind] = useState<Kind>("OPEN");

	return (
		<Dialog
			open={pipeline !== null}
			onOpenChange={(next) => {
				if (!next) onClose();
				else {
					setName("");
					setKind("OPEN");
				}
			}}
		>
			<DialogContent>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit(name.trim(), kind);
					}}
				>
					<DialogHeader>
						<DialogTitle>Add a stage</DialogTitle>
						<DialogDescription>
							It goes at the end of {pipeline?.name}. Reorder it afterwards.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor={nameId}>Name</FieldLabel>
						<Input
							id={nameId}
							required
							autoComplete="off"
							placeholder="Viewing booked"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={kindId}>Counts as</FieldLabel>
						<Select
							value={kind}
							onValueChange={(next) => setKind(next as Kind)}
						>
							<SelectTrigger id={kindId}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(KIND_LABEL) as Kind[]).map((option) => (
									<SelectItem key={option} value={option}>
										{KIND_LABEL[option]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>{KIND_HINT[kind]}</FieldDescription>
					</Field>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={pending || !name.trim()}>
							Add stage
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

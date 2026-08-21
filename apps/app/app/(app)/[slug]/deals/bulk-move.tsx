"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function BulkMove({
	dealIds,
	onDone,
}: {
	dealIds: string[];
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const stageFieldId = useId();
	const reasonId = useId();

	const [open, setOpen] = useState(false);
	const [stageId, setStageId] = useState("");
	const [reason, setReason] = useState("");

	const pipelines = useQuery(trpc.pipelines.list.queryOptions());

	const chosen = pipelines.data
		?.flatMap((pipeline) => pipeline.stages)
		.find((stage) => stage.id === stageId);

	const needsReason = chosen?.kind === "LOST";

	const move = useMutation(
		trpc.deals.move.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				setOpen(false);
				setStageId("");
				setReason("");
				onDone();
				toast.success(
					`${result.moved} ${result.moved === 1 ? "deal" : "deals"} moved.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				Move to stage
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							move.mutate({
								dealIds,
								stageId,
								closedReason: needsReason ? reason : undefined,
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>
								Move {dealIds.length} {dealIds.length === 1 ? "deal" : "deals"}
							</DialogTitle>
							<DialogDescription>
								They all land in the stage you pick, and each one keeps a record
								of the move.
							</DialogDescription>
						</DialogHeader>

						<Field>
							<FieldLabel htmlFor={stageFieldId}>Stage</FieldLabel>
							<Select value={stageId} onValueChange={setStageId}>
								<SelectTrigger id={stageFieldId}>
									<SelectValue placeholder="Pick a stage" />
								</SelectTrigger>
								<SelectContent>
									{(pipelines.data ?? []).map((pipeline) => (
										<SelectGroup key={pipeline.id}>
											<SelectLabel>{pipeline.name}</SelectLabel>
											{pipeline.stages.map((stage) => (
												<SelectItem key={stage.id} value={stage.id}>
													{stage.name}
												</SelectItem>
											))}
										</SelectGroup>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								Picking a stage in another pipeline moves the deals into that
								pipeline.
							</FieldDescription>
						</Field>

						{needsReason ? (
							<Field>
								<FieldLabel htmlFor={reasonId}>Why were they lost?</FieldLabel>
								<Textarea
									id={reasonId}
									value={reason}
									onChange={(event) => setReason(event.target.value)}
									placeholder="Went quiet after the proposal."
									required
								/>
							</Field>
						) : null}

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									move.isPending ||
									!stageId ||
									(needsReason && reason.trim().length === 0)
								}
							>
								Move
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

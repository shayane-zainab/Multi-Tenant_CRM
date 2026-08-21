"use client";

import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type Visibility = "everyone" | "own";

const HINT: Record<Visibility, string> = {
	everyone: "Everyone in the workspace sees every lead.",
	own: "A member sees only the leads they own. Owners and admins still see all of them.",
};

export function LeadVisibilityField({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const fieldId = useId();

	const current = useQuery(trpc.settings.leadVisibility.queryOptions());

	const save = useMutation(
		trpc.settings.setLeadVisibility.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Lead visibility changed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const value = (current.data?.visibility ?? "everyone") as Visibility;

	return (
		<Field>
			<FieldLabel htmlFor={fieldId}>Who sees which leads</FieldLabel>
			<Select
				value={value}
				disabled={!canManage || current.isLoading || save.isPending}
				onValueChange={(next) =>
					save.mutate({ visibility: next as Visibility })
				}
			>
				<SelectTrigger id={fieldId}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="everyone">Everyone sees every lead</SelectItem>
					<SelectItem value="own">Each member sees only their own</SelectItem>
				</SelectContent>
			</Select>
			<FieldDescription>{HINT[value]}</FieldDescription>
		</Field>
	);
}

"use client";

import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../sso/copy-value";

type KeyRow = RouterOutputs["mcpKeys"]["settings"]["keys"][number];

function connectCommand(endpoint: string, secret: string): string {
	return `claude mcp add --transport http crm ${endpoint} --header "Authorization: Bearer ${secret}"`;
}

function lastUsed(value: string | null): string {
	if (!value) return "Never used";

	return `Last used ${new Date(value).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	})}`;
}

export function McpKeys() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const nameId = useId();
	const [name, setName] = useState("");
	const [issued, setIssued] = useState<{
		secret: string;
		endpoint: string;
	} | null>(null);

	const settings = useQuery(trpc.mcpKeys.settings.queryOptions());

	const create = useMutation(
		trpc.mcpKeys.create.mutationOptions({
			onSuccess: async (result) => {
				setIssued({ secret: result.secret, endpoint: result.endpoint });
				setName("");
				await cache.mcpKeys();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.mcpKeys.revoke.mutationOptions({
			onSuccess: async () => {
				toast.success("Key revoked.");
				await cache.mcpKeys();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!settings.data) return null;

	const { canManage, endpoint, keys } = settings.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Model Context Protocol</CardTitle>
				<CardDescription>
					A key lets Claude, or any other MCP client, read and write this
					workspace's CRM. It can create and change records, and log activity.
					It cannot delete anything.
				</CardDescription>

				{canManage ? (
					<CardAction>
						<Button
							type="submit"
							form="mcp-key"
							disabled={create.isPending || name.trim() === ""}
						>
							{create.isPending ? <Spinner data-icon="inline-start" /> : null}
							Create key
						</Button>
					</CardAction>
				) : null}
			</CardHeader>

			<CardContent className="flex flex-col gap-6">
				{canManage ? (
					<form
						id="mcp-key"
						onSubmit={(event) => {
							event.preventDefault();
							create.mutate({ name: name.trim() });
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={nameId}>Name</FieldLabel>
								<Input
									id={nameId}
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Taha's laptop"
									maxLength={32}
									autoComplete="off"
									disabled={create.isPending}
								/>
								<FieldDescription>
									Name it after the machine or the person holding it, so you
									know which one to revoke.
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				) : (
					<p className="text-muted-foreground text-sm">
						Only the workspace owner can create or revoke a key.
					</p>
				)}

				{issued ? (
					<div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 p-4">
						<p className="font-medium text-sm">
							Copy this now. It is not shown again.
						</p>
						<div className="flex min-w-0 items-center gap-1">
							<code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
								{connectCommand(issued.endpoint, issued.secret)}
							</code>
							<CopyValue
								value={connectCommand(issued.endpoint, issued.secret)}
								label="Connect command"
							/>
						</div>
						<p className="text-muted-foreground text-xs">
							Run it in a terminal, then restart your client. For anything that
							is not Claude Code, point it at {endpoint} and send the key as an
							Authorization Bearer header.
						</p>
					</div>
				) : null}

				{keys.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No keys yet. Nothing outside this CRM can reach it.
					</p>
				) : (
					<ul className="flex flex-col divide-y rounded-md border">
						{keys.map((row: KeyRow) => (
							<li
								key={row.id}
								className="flex items-center justify-between gap-3 p-3"
							>
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-medium text-sm">
										{row.name ?? "Unnamed key"}
										{row.start ? (
											<span className="ml-2 font-mono text-muted-foreground text-xs">
												{row.start}…
											</span>
										) : null}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{lastUsed(row.lastRequest)}
										{row.createdByName ? ` · made by ${row.createdByName}` : ""}
									</span>
								</span>

								{canManage ? (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												disabled={revoke.isPending}
											>
												<Icon icon={TrashCan} />
												<span className="sr-only">
													Revoke {row.name ?? "this key"}
												</span>
											</Button>
										</AlertDialogTrigger>

										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Revoke {row.name ?? "this key"}?
												</AlertDialogTitle>
												<AlertDialogDescription>
													Whatever is holding it loses access immediately, and
													the next request it makes fails. This cannot be
													undone.
												</AlertDialogDescription>
											</AlertDialogHeader>

											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogAction
													variant="destructive"
													onClick={() => revoke.mutate({ keyId: row.id })}
												>
													Revoke
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								) : null}
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
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
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function WhatsAppUnavailable() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>WhatsApp</CardTitle>
				<CardDescription>
					WhatsApp needs a Meta app, and this install does not have one. Set
					WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET in the root .env file
					and restart.
				</CardDescription>

				<CardAction>
					<StatusIndicator size="sm" tone="neutral" label="Not configured" />
				</CardAction>
			</CardHeader>
		</Card>
	);
}

function ConnectWhatsApp({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [phoneNumberId, setPhoneNumberId] = useState("");
	const [accessToken, setAccessToken] = useState("");

	const connect = useMutation(
		trpc.whatsapp.connect.mutationOptions({
			onSuccess: async () => {
				setPhoneNumberId("");
				setAccessToken("");
				await cache.whatsapp();
				toast.success("WhatsApp connected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const ready = phoneNumberId.trim() !== "" && accessToken.trim() !== "";

	return (
		<Card>
			<CardHeader>
				<CardTitle>WhatsApp</CardTitle>
				<CardDescription>
					Messages sent and received on the number stay on the phone and are
					copied onto the matching contact. Replies sent from the phone arrive
					too. Group chats and status updates are never sent by WhatsApp, so
					they do not appear here.
				</CardDescription>

				<CardAction>
					<StatusIndicator size="sm" tone="neutral" label="Not connected" />
				</CardAction>
			</CardHeader>

			<CardContent>
				{canManage ? (
					<>
						<div className="flex flex-col gap-2">
							<Label htmlFor="whatsapp-phone-number-id">Phone number ID</Label>
							<Input
								id="whatsapp-phone-number-id"
								value={phoneNumberId}
								onChange={(event) => setPhoneNumberId(event.target.value)}
								placeholder="From Meta → WhatsApp → API setup"
								autoComplete="off"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="whatsapp-access-token">Access token</Label>
							<Input
								id="whatsapp-access-token"
								type="password"
								value={accessToken}
								onChange={(event) => setAccessToken(event.target.value)}
								placeholder="A permanent System User token"
								autoComplete="off"
							/>
						</div>

						<Button
							type="button"
							disabled={!ready || connect.isPending}
							onClick={() =>
								connect.mutate({
									phoneNumberId: phoneNumberId.trim(),
									accessToken: accessToken.trim(),
								})
							}
						>
							{connect.isPending ? "Connecting…" : "Connect WhatsApp"}
						</Button>

						<p className="text-muted-foreground text-xs">
							The number must already be linked through WhatsApp Coexistence,
							and Meta's webhook must be subscribed to both messages and message
							echoes. Without the second one, replies sent from the phone never
							arrive.
						</p>
					</>
				) : (
					<p className="text-muted-foreground text-xs">
						Only an owner or an admin can connect WhatsApp.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

export function WhatsAppConnection() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const status = useQuery(trpc.whatsapp.status.queryOptions());

	const setAutoCreate = useMutation(
		trpc.whatsapp.setAutoCreate.mutationOptions({
			onSuccess: () => cache.whatsapp(undefined, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const disconnect = useMutation(
		trpc.whatsapp.disconnect.mutationOptions({
			onSuccess: async () => {
				await cache.whatsapp();
				toast.success("WhatsApp disconnected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const purge = useMutation(
		trpc.whatsapp.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.whatsapp();
				toast.success(`Removed ${result.purged} conversations.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return null;

	const { configured, canManage, connections } = status.data;

	if (!configured) return <WhatsAppUnavailable />;
	if (connections.length === 0) {
		return <ConnectWhatsApp canManage={canManage} />;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>WhatsApp</CardTitle>
				<CardDescription>
					Messages are copied onto the matching contact as they happen, both
					ways. Group chats and status updates never arrive.
				</CardDescription>

				<CardAction>
					<StatusIndicator
						size="sm"
						tone={
							connections.some((connection) => connection.lastError)
								? "warning"
								: "success"
						}
						label={
							connections.some((connection) => connection.lastError)
								? "Needs attention"
								: "Connected"
						}
					/>
				</CardAction>
			</CardHeader>

			<CardContent>
				{connections.map((connection) => (
					<div key={connection.id} className="flex flex-col gap-4">
						{connection.lastError ? (
							<Alert variant="destructive">
								<Icon icon={Warning} />
								<AlertTitle>WhatsApp reported a problem</AlertTitle>
								<AlertDescription>{connection.lastError}</AlertDescription>
							</Alert>
						) : null}

						{!connection.canSend ? (
							<Alert>
								<Icon icon={Warning} />
								<AlertTitle>Replying is unavailable</AlertTitle>
								<AlertDescription>
									No access token is stored for this number, so messages arrive
									but cannot be sent from the CRM.
								</AlertDescription>
							</Alert>
						) : null}

						<div className="flex items-center justify-between gap-6">
							<div className="flex flex-col gap-1">
								<span className="text-sm">
									{connection.displayPhone ?? connection.phoneNumberId}
								</span>
								<span className="text-muted-foreground text-xs">
									{connection.lastEventAt
										? `Last message ${relativeTimeFromIso(connection.lastEventAt)}`
										: "Waiting for the first message"}
									{` · ${connection.threadCount} conversation${connection.threadCount === 1 ? "" : "s"}`}
								</span>
							</div>
						</div>

						<div className="flex items-center justify-between gap-6">
							<Label
								htmlFor={`whatsapp-auto-create-${connection.id}`}
								className="flex flex-col items-start gap-1"
							>
								<span className="text-sm">Unknown numbers</span>
								<span className="font-normal text-muted-foreground text-xs">
									Add a contact when somebody new messages this number
								</span>
							</Label>

							<Switch
								id={`whatsapp-auto-create-${connection.id}`}
								checked={connection.autoCreate}
								disabled={!canManage || setAutoCreate.isPending}
								onCheckedChange={(enabled) =>
									setAutoCreate.mutate({
										connectionId: connection.id,
										enabled,
									})
								}
							/>
						</div>

						{canManage ? (
							<CardFooter>
								<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												variant="ghost"
												size="xs"
												disabled={purge.isPending}
											>
												Delete synced data
											</Button>
										</AlertDialogTrigger>

										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Delete synced conversations?
												</AlertDialogTitle>
												<AlertDialogDescription>
													Every WhatsApp conversation brought into the CRM is
													removed. Nothing on the phone is touched, and new
													messages start arriving again immediately.
												</AlertDialogDescription>
											</AlertDialogHeader>

											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogAction
													variant="destructive"
													onClick={() => purge.mutate()}
												>
													Delete
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>

									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												variant="ghost"
												size="xs"
												disabled={disconnect.isPending}
											>
												Disconnect
											</Button>
										</AlertDialogTrigger>

										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Disconnect this number?
												</AlertDialogTitle>
												<AlertDialogDescription>
													New messages stop arriving and every conversation
													already synced is removed with the connection. The
													number keeps working on the phone.
												</AlertDialogDescription>
											</AlertDialogHeader>

											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogAction
													variant="destructive"
													onClick={() =>
														disconnect.mutate({ connectionId: connection.id })
													}
												>
													Disconnect
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
							</CardFooter>
						) : null}
					</div>
				))}
			</CardContent>
		</Card>
	);
}

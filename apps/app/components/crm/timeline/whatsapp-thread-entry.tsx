"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Button } from "@crm/ui/components/button";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Textarea } from "@crm/ui/components/textarea";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const timeFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

const FAILED = "FAILED";

export function WhatsAppThreadEntry({
	threadId,
	waId,
	profileName,
	messageCount,
}: {
	threadId: string;
	waId: string;
	profileName: string | null;
	messageCount: number;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [opened, setOpened] = useState(false);
	const [draft, setDraft] = useState("");

	const thread = useQuery({
		...trpc.whatsapp.thread.queryOptions({ threadId }),
		enabled: opened,
	});

	const send = useMutation(
		trpc.whatsapp.send.mutationOptions({
			onSuccess: async () => {
				setDraft("");
				await cache.whatsapp(threadId, { settle: "record" });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const them = profileName ?? waId;

	return (
		<Accordion
			type="single"
			collapsible
			onValueChange={(value) => {
				if (value) setOpened(true);
			}}
		>
			<AccordionItem value={threadId}>
				<AccordionTrigger variant="subtle">
					{messageCount === 1 ? "1 message" : `${messageCount} messages`}
				</AccordionTrigger>

				<AccordionContent>
					{thread.isPending ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					) : thread.isError ? (
						<p className="text-muted-foreground text-xs">
							{thread.error.message}
						</p>
					) : (
						<div className="flex flex-col gap-3">
							<div className="flex flex-col">
								{thread.data?.messages.map((message) => (
									<ThreadMessage
										key={message.id}
										from={message.direction === "INBOUND" ? them : "You"}
										fromHandle={
											message.direction === "INBOUND"
												? (thread.data?.phone ?? waId)
												: "WhatsApp"
										}
										sentAt={timeFormat.format(new Date(message.sentAt))}
										direction={message.direction}
										body={message.body ?? message.caption}
										action={
											message.status === FAILED ? (
												<span className="text-destructive">
													{message.failedTitle ?? "Not delivered"}
												</span>
											) : null
										}
									/>
								))}
							</div>

							<div className="flex flex-col gap-2">
								<Textarea
									aria-label={`Reply to ${them} on WhatsApp`}
									placeholder="Reply on WhatsApp…"
									value={draft}
									rows={2}
									disabled={send.isPending}
									onChange={(event) => setDraft(event.target.value)}
								/>

								<div className="flex items-center justify-between gap-3">
									<p className="text-muted-foreground text-xs">
										Sent from the connected number, and it appears on the phone
										too.
									</p>

									<Button
										size="sm"
										type="button"
										disabled={draft.trim() === "" || send.isPending}
										onClick={() =>
											send.mutate({ threadId, body: draft.trim() })
										}
									>
										{send.isPending ? "Sending…" : "Send"}
									</Button>
								</div>
							</div>
						</div>
					)}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

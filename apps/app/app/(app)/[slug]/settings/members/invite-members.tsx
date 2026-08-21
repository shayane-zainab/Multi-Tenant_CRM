"use client";

import Add from "@carbon/icons-react/es/Add";
import Copy from "@carbon/icons-react/es/Copy";
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
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Invitation = RouterOutputs["workspace"]["invitations"][number];

type Role = "owner" | "admin" | "member";

const ROLE_LABEL: Record<Role, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

const ROLE_HINT: Record<Role, string> = {
	owner: "Full control, including ownership of the workspace.",
	admin: "Can invite people and change roles.",
	member: "Can work the CRM, but not manage the workspace.",
};

function signInLink(): string {
	if (typeof window === "undefined") return "/sign-in";
	return `${window.location.origin}/sign-in`;
}

async function copyText(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}

export function InviteMembers({ canInvite }: { canInvite: boolean }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const emailId = useId();
	const roleId = useId();
	const linkId = useId();

	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("member");
	const [invited, setInvited] = useState<Invitation | null>(null);

	const invitations = useQuery({
		...trpc.workspace.invitations.queryOptions(),
		enabled: canInvite,
	});

	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.workspace.invitations.queryKey(),
		});
	};

	const invite = useMutation(
		trpc.workspace.invite.mutationOptions({
			onSuccess: async (created) => {
				setInvited(created);
				setEmail("");
				setRole("member");
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.workspace.revokeInvitation.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Invitation revoked.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!canInvite) return null;

	const pending = invitations.data ?? [];

	const close = () => {
		setOpen(false);
		setInvited(null);
		setEmail("");
		setRole("member");
	};

	const copyLink = async () => {
		const ok = await copyText(signInLink());
		if (ok) {
			toast.success("Sign-in link copied.");
			return;
		}
		toast.error("Could not copy the link.");
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">Pending invitations</span>
					<span className="text-muted-foreground text-sm">
						{pending.length === 0
							? "Nobody is waiting to join."
							: `${pending.length} ${
									pending.length === 1 ? "person has" : "people have"
								} been invited.`}
					</span>
				</div>

				<Button onClick={() => setOpen(true)}>
					<Icon icon={Add} />
					Invite someone
				</Button>
			</div>

			{pending.length > 0 ? (
				<ul className="flex flex-col gap-2">
					{pending.map((invitation) => (
						<li
							key={invitation.id}
							className="flex items-center justify-between gap-4 rounded-md border p-3"
						>
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-sm">{invitation.email}</span>
								<span className="text-muted-foreground text-xs">
									{ROLE_LABEL[invitation.role as Role]} · invited{" "}
									{relativeTimeFromIso(invitation.createdAt)}
								</span>
							</span>

							<span className="flex shrink-0 items-center gap-1">
								<Button variant="ghost" size="icon" onClick={copyLink}>
									<Icon icon={Copy} />
									<span className="sr-only">Copy the sign-in link</span>
								</Button>

								<Button
									variant="ghost"
									size="icon"
									disabled={revoke.isPending}
									onClick={() => revoke.mutate({ invitationId: invitation.id })}
								>
									<Icon icon={TrashCan} />
									<span className="sr-only">
										Revoke the invitation for {invitation.email}
									</span>
								</Button>
							</span>
						</li>
					))}
				</ul>
			) : null}

			<Dialog open={open} onOpenChange={(next) => !next && close()}>
				<DialogContent>
					{invited ? (
						<>
							<DialogHeader>
								<DialogTitle>Invitation ready</DialogTitle>
								<DialogDescription>
									Send {invited.email} this link. When they sign in with that
									address they join this workspace as{" "}
									{ROLE_LABEL[invited.role as Role].toLowerCase()}.
								</DialogDescription>
							</DialogHeader>

							<Field>
								<FieldLabel htmlFor={linkId}>Sign-in link</FieldLabel>
								<Input
									id={linkId}
									readOnly
									value={signInLink()}
									onFocus={(event) => event.currentTarget.select()}
								/>
								<FieldDescription>
									The invitation expires in seven days.
								</FieldDescription>
							</Field>

							<DialogFooter>
								<Button variant="outline" onClick={close}>
									Done
								</Button>
								<Button onClick={copyLink}>
									<Icon icon={Copy} />
									Copy link
								</Button>
							</DialogFooter>
						</>
					) : (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								invite.mutate({ email, role });
							}}
						>
							<DialogHeader>
								<DialogTitle>Invite someone</DialogTitle>
								<DialogDescription>
									They join this workspace when they sign in with the address
									you enter here.
								</DialogDescription>
							</DialogHeader>

							<Field>
								<FieldLabel htmlFor={emailId}>Email address</FieldLabel>
								<Input
									id={emailId}
									type="email"
									required
									autoComplete="off"
									placeholder="colleague@company.com"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={roleId}>Role</FieldLabel>
								<Select
									value={role}
									onValueChange={(next) => setRole(next as Role)}
								>
									<SelectTrigger id={roleId}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(Object.keys(ROLE_LABEL) as Role[]).map((option) => (
											<SelectItem key={option} value={option}>
												{ROLE_LABEL[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldDescription>{ROLE_HINT[role]}</FieldDescription>
							</Field>

							<DialogFooter>
								<Button type="button" variant="outline" onClick={close}>
									Cancel
								</Button>
								<Button type="submit" disabled={invite.isPending || !email}>
									Create invitation
								</Button>
							</DialogFooter>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

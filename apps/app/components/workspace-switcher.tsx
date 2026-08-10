"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import Workspace from "@carbon/icons-react/es/Workspace";
import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function WorkspaceSwitcher({
	currentWorkspaceId,
	currentWorkspaceName,
}: {
	currentWorkspaceId: string | undefined;
	currentWorkspaceName: string | undefined;
}) {
	const { data: organizations } = authClient.useListOrganizations();
	const trpc = useTRPC();

	async function handleSwitch(organizationId: string, slug: string) {
		if (organizationId === currentWorkspaceId) return;

		const { error } = await authClient.organization.setActive({
			organizationId,
		});

		if (error) {
			toast.error("Could not switch workspaces.");
			return;
		}

		window.location.assign(`/${slug}`);
	}

	if (!organizations || organizations.length <= 1) {
		return (
			<span className="min-w-0 truncate font-medium text-sm">
				{currentWorkspaceName}
			</span>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="flex items-center gap-1.5 px-2 hover:bg-transparent data-[state=open]:bg-transparent"
				>
					<span className="min-w-0 truncate font-medium text-sm">
						{currentWorkspaceName}
					</span>
					<ChevronDown className="size-4 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-56">
				<DropdownMenuLabel className="flex items-center gap-2">
					<Workspace />
					Switch Workspace
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{organizations.map((org) => (
					<DropdownMenuItem
						key={org.id}
						onSelect={() => handleSwitch(org.id, org.slug)}
						className="flex items-center justify-between"
					>
						<span className="truncate">{org.name}</span>
						{org.id === currentWorkspaceId && <Checkmark className="size-4" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

"use client";

import Download from "@carbon/icons-react/es/Download";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterInputs } from "@/lib/trpc/types";

const HEADERS = [
	["name", "Name"],
	["company", "Company"],
	["domain", "Domain"],
	["industry", "Industry"],
	["country", "Country"],
	["owner", "Owner"],
	["ownerEmail", "Owner email"],
	["pipeline", "Pipeline"],
	["stage", "Stage"],
	["stageKind", "Stage type"],
	["amount", "Amount"],
	["currency", "Currency"],
	["expectedCloseDate", "Expected close"],
	["closedAt", "Closed"],
	["closedReason", "Closed reason"],
	["lastActivityAt", "Last activity"],
	["createdAt", "Created"],
] as const;

function cell(value: unknown): string {
	if (value === null || value === undefined) return "";

	const text = String(value);

	if (/^[=+\-@]/.test(text)) {
		return `"'${text.replace(/"/g, '""')}"`;
	}

	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}

	return text;
}

function toCsv(rows: Record<string, unknown>[]): string {
	const head = HEADERS.map(([, label]) => cell(label)).join(",");
	const body = rows.map((row) =>
		HEADERS.map(([key]) => cell(row[key])).join(","),
	);
	return [head, ...body].join("\r\n");
}

function stamp(): string {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ExportDeals({
	input,
	total,
}: {
	input: RouterInputs["deals"]["list"];
	total: number;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);

	const run = async () => {
		setBusy(true);

		try {
			const result = await queryClient.fetchQuery(
				trpc.deals.exportRows.queryOptions(input),
			);

			if (result.rows.length === 0) {
				toast.error("Nothing to export in this view.");
				return;
			}

			const csv = toCsv(result.rows as unknown as Record<string, unknown>[]);
			const blob = new Blob([`﻿${csv}`], {
				type: "text/csv;charset=utf-8",
			});
			const url = URL.createObjectURL(blob);

			const link = document.createElement("a");
			link.href = url;
			link.download = `deals-${stamp()}.csv`;
			document.body.append(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);

			if (result.truncated) {
				toast.warning(
					`Exported the first ${result.rows.length} of ${total}. Narrow the filters to get the rest.`,
				);
				return;
			}

			toast.success(
				`Exported ${result.rows.length} ${
					result.rows.length === 1 ? "deal" : "deals"
				}.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "The export failed.",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Button variant="outline" size="sm" disabled={busy} onClick={run}>
			{busy ? <Spinner /> : <Icon icon={Download} />}
			Export
		</Button>
	);
}

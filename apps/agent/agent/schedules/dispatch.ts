import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { brief, drainAll, taskAuth } from "../lib/dispatch";

export default defineSchedule({
	cron: process.env.DISPATCH_CRON ?? "* * * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			drainAll((task) =>
				receive(crm, {
					message: brief(task),
					target: { taskId: task.id },
					auth: taskAuth(task, appAuth),
				}),
			),
		);
	},
});

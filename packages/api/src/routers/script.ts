import { db } from "@shuaibin-cookie-app/db";
import { tasks } from "@shuaibin-cookie-app/db/schema";
import { and, eq, not } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import {
	deleteScript,
	findScriptByPackage,
	getScript,
	loadScripts,
} from "../services/script-store";

const deleteScriptSchema = z.object({ id: z.string() });

export const scriptRouter = {
	list: publicProcedure.handler(async () => loadScripts()),

	delete: publicProcedure
		.input(deleteScriptSchema)
		.handler(async ({ input }) => {
			const script = await getScript(input.id);

			if (!script) {
				throw new Error("Script not found");
			}

			const activeTasks = await db
				.select()
				.from(tasks)
				.where(
					and(
						eq(tasks.scriptPackage, script.packageName),
						not(eq(tasks.status, "idle")),
						not(eq(tasks.status, "completed")),
						not(eq(tasks.status, "error"))
					)
				)
				.all();

			if (activeTasks.length > 0) {
				throw new Error("Script has active tasks");
			}

			await deleteScript(script.id);
			return { success: true };
		}),

	byPackage: publicProcedure
		.input(z.object({ packageName: z.string() }))
		.handler(async ({ input }) => findScriptByPackage(input.packageName)),
};

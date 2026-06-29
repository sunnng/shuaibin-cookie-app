import { db } from "@shuaibin-cookie-app/db";
import { simulators } from "@shuaibin-cookie-app/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import {
	arrangeWindows,
	launchSimulator,
	shutdownSimulator,
	syncDiscoveredSimulators,
} from "../services/simulator-discovery";

const simulatorIdSchema = z.object({ id: z.string() });
const arrangeSchema = z.object({
	layout: z.enum(["grid", "horizontal", "vertical"]),
	columns: z.number().optional(),
});

export const simulatorRouter = {
	list: publicProcedure.handler(async () => db.select().from(simulators).all()),

	discover: publicProcedure.handler(async () => syncDiscoveredSimulators()),

	launch: publicProcedure
		.input(simulatorIdSchema)
		.handler(async ({ input }) => {
			const sim = await db
				.select()
				.from(simulators)
				.where(eq(simulators.id, input.id))
				.get();

			if (!sim) {
				throw new Error("Simulator not found");
			}

			await launchSimulator(sim);
			return { success: true };
		}),

	shutdown: publicProcedure
		.input(simulatorIdSchema)
		.handler(async ({ input }) => {
			const sim = await db
				.select()
				.from(simulators)
				.where(eq(simulators.id, input.id))
				.get();

			if (!sim) {
				throw new Error("Simulator not found");
			}

			await shutdownSimulator(sim);
			return { success: true };
		}),

	delete: publicProcedure
		.input(simulatorIdSchema)
		.handler(async ({ input }) => {
			await db.delete(simulators).where(eq(simulators.id, input.id));
			return { success: true };
		}),

	arrange: publicProcedure.input(arrangeSchema).handler(async ({ input }) => {
		await arrangeWindows(input.layout, input.columns);
		return { success: true };
	}),
};

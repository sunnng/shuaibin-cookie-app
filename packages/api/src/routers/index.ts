import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { scriptRouter } from "./script";
import { simulatorRouter } from "./simulator";
import { taskRouter } from "./task";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	script: scriptRouter,
	simulator: simulatorRouter,
	task: taskRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;

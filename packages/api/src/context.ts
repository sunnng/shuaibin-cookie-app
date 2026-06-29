import type { Context as ElysiaContext } from "elysia";

export interface CreateContextOptions {
	context: ElysiaContext;
}

export function createContext(_options: CreateContextOptions) {
	return {
		auth: null,
		session: null,
	};
}

export type Context = ReturnType<typeof createContext>;

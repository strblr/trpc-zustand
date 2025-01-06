import z from "zod";
import { publicProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";

type Todo = { id: string; title: string; listId: string };
const todos: Todo[] = [];

export const appRouter = router({
  todos: {
    getTodos: publicProcedure
      .input(
        z.object({
          listId: z.string()
        })
      )
      .query(async ({ input }) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return todos.filter(todo => todo.listId === input.listId);
      }),

    addTodo: publicProcedure
      .input(
        z.object({
          title: z.string(),
          listId: z.string()
        })
      )
      .mutation(({ input }) => {
        const todo: Todo = {
          id: crypto.randomUUID(),
          title: input.title,
          listId: input.listId
        };
        todos.push(todo);
        return todo;
      }),

    deleteTodo: publicProcedure
      .input(
        z.object({
          id: z.string()
        })
      )
      .mutation(({ input }) => {
        const index = todos.findIndex(todo => todo.id === input.id);
        if (index === -1) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Todo not found"
          });
        }
        const deleted = todos[index];
        todos.splice(index, 1);
        return deleted;
      }),

    streamTodos: publicProcedure
      .input(
        z.object({
          listId: z.string()
        })
      )
      .subscription(async function* ({ input }) {
        const list = todos.filter(todo => todo.listId === input.listId);
        for (const todo of list) {
          yield todo;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      })
  }
});

export type AppRouter = typeof appRouter;

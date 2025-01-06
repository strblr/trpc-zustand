import {
  loggerLink,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink
} from "@trpc/react-query";
import { StateCreator, create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppRouter } from "../../../packages/demo-server/router";
import { createTRPCZustand, InferStore } from "trpc-zustand";

export const trpc = createTRPCZustand<AppRouter>({
  links: [
    loggerLink(),
    splitLink({
      condition: op => op.type === "subscription",
      true: unstable_httpSubscriptionLink({
        url: "http://localhost:2022"
      }),
      false: unstable_httpBatchStreamLink({
        url: "http://localhost:2022"
      })
    })
  ]
});

export const useTodosStore = create(
  persist(trpc.todos.getTodos.queryStore(), {
    name: "todos",
    partialize: ({ data }) => ({ data })
  })
);

export const useAddTodoStore = create(
  trpc.todos.addTodo.mutationStore({
    refetchStores: () => [useTodosStore]
  })
);

type DeleteTodoSlice = InferStore<typeof deleteTodoStore>;

type AdditionalSlice = {
  foo: string;
  resetFoo: () => void;
};

const deleteTodoStore = trpc.todos.deleteTodo.mutationStore({
  refetchStores: () => [useTodosStore]
});

const additionalStore: StateCreator<
  DeleteTodoSlice & AdditionalSlice,
  [],
  [],
  AdditionalSlice
> = (set, get) => ({
  foo: "bar",
  resetFoo: () => set({ foo: get().loading ? "bar" : "baz" })
});

export const useDeleteTodoStore = create<DeleteTodoSlice & AdditionalSlice>(
  (...a) => ({
    ...deleteTodoStore(...a),
    ...additionalStore(...a)
  })
);

export const useStreamTodosStore = create(
  trpc.todos.streamTodos.subscriptionStore()
);

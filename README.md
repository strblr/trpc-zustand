# trpc-zustand

Zustand bindings for tRPC clients. Manage tRPC queries, mutations and subscriptions as Zustand stores.

trpc-zustand bridges the gap between [tRPC](https://trpc.io/) and [Zustand](https://zustand.docs.pmnd.rs/), allowing you to use Zustand-specific patterns to manage tRPC operations and their state, including middlewares, store slicing, selectors, React integration, and more. Fully typed and compatible with tRPC v11 and Zustand v5.

- [Installation](#installation)
- [Setup](#setup)
- [Guides](#guides)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## Installation

Install `trpc-zustand` and its peer dependencies `@trpc/client`, `@trpc/server`, and `zustand`:

```bash
npm install trpc-zustand @trpc/client @trpc/server zustand
yarn add trpc-zustand @trpc/client @trpc/server zustand
bun add trpc-zustand @trpc/client @trpc/server zustand
```

## Setup

Create a tRPC client with `createTRPCZustand`:

```ts
import {
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink
} from "@trpc/client";
import { createTRPCZustand } from "trpc-zustand";
import { create } from "zustand";
import type { AppRouter } from "./server";

const trpc = createTRPCZustand<AppRouter>({
  links: [
    splitLink({
      condition: op => op.type === "subscription",
      // In case you want subscriptions:
      true: unstable_httpSubscriptionLink({ url: "http://localhost:2022" }),
      false: unstable_httpBatchStreamLink({ url: "http://localhost:2022" })
    })
  ]
});
```

Then create Zustand stores using the client, one store per tRPC operation. The client returns Zustand state creators (the function that takes `set` and `get`) so it works just fine with both React- and vanilla Zustand:

```ts
import { create } from "zustand"; // React

export const useTodosStore = create(trpc.todos.getTodos.queryStore());
export const useAddTodoStore = create(trpc.todos.addTodo.mutationStore());
```

```ts
import { createStore } from "zustand"; // Vanilla

export const todosStore = createStore(trpc.todos.getTodos.queryStore());
export const addTodoStore = createStore(trpc.todos.addTodo.mutationStore());
```

You can pass initialization options to the store creator:

```ts
export const useTodosStore = create(
  trpc.todos.getTodos.queryStore({ keepPreviousData: false })
);

export const useAddTodoStore = create(
  trpc.todos.addTodo.mutationStore({ refetchStores: () => [useTodosStore] })
);
```

## Guides

### Vanilla demo

Here is an overview of the API that the tRPC stores expose. For an exhaustive list of methods and properties, see the [API Reference](#api-reference).

```ts
import { createTRPCZustand } from "trpc-zustand";
import { createStore } from "zustand";
import type { AppRouter } from "./server";

const trpc = createTRPCZustand<AppRouter>({
  /* ... */
});

const todosStore = createStore(trpc.todos.getTodos.queryStore());
const addTodoStore = createStore(trpc.todos.addTodo.mutationStore());

// Fetch data
todosStore.getState().query({ listId: "1" });

// Refetch data (last input)
todosStore.getState().refetch();

// Disable/enable/reset a store
todosStore.getState().disable();
todosStore.getState().enable();
todosStore.getState().reset();

// Execute a mutation
addTodoStore.getState().mutate({ listId: "1", title: "Buy milk" });

// Lookup a store's state
const { data, loading, error } = todosStore.getState();
const isAddingTodo = addTodoStore.getState().loading;

// Listen to state changes
const unsubscribe = addTodoStore.subscribe((state, prevState) => {
  if (state.loading && !prevState.loading) {
    console.log("Adding todo...");
  }
});
```

### React demo

Everything that works with vanilla stores works on React stores too. But in addition to that, you can use the store as a hook with or without custom selectors. The component will re-render when the selected store state changes. Note: if you only need methods, there is no need to use it as a hook as the methods never change.

```tsx
import { createTRPCZustand } from "trpc-zustand";
import { create } from "zustand";
import type { AppRouter } from "./server";

const trpc = createTRPCZustand<AppRouter>({
  /* ... */
});

const useTodosStore = create(trpc.todos.getTodos.queryStore());
const useAddTodoStore = create(trpc.todos.addTodo.mutationStore());

function TodoList({ listId }: { listId: string }) {
  // Use the entire store
  const todos = useTodosStore();

  useEffect(() => {
    // Fetch data
    todos.query({ listId });
  }, [listId]);

  const addTodo = async () => {
    // Execute a mutation
    await useAddTodoStore.getState().mutate({ listId, title: "Buy milk" });
    // Refetch data
    await todos.refetch();
  };

  // Display query states and data
  return (
    <div>
      {todos.loading ? (
        <p>Loading...</p>
      ) : todos.error ? (
        <p>Error: {todos.error.message}</p>
      ) : (
        todos.data && (
          <ul>
            {todos.data.map(todo => (
              <li key={todo.id}>{todo.title}</li>
            ))}
          </ul>
        )
      )}
      <button onClick={addTodo}>Add todo</button>
      <Loader />
    </div>
  );
}

function Loader() {
  // Use custom selectors
  const addTodoLoading = useAddTodoStore(state => state.loading);

  return <p>addTodo is {addTodoLoading ? "loading" : "not loading"}</p>;
}
```

### Zustand middlewares

Zustand middlewares will work like with any other Zustand store. The following example persists the data of the latest `getTodos` query in localStorage. When you reload the page, the data will be restored without having to refetch it.

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useTodosStore = create(
  persist(trpc.todos.getTodos.queryStore(), {
    name: "todos",
    partialize: ({ data }) => ({ data })
  })
);
```

### Store slicing

You can compose a tRPC store with other Zustand stores using the [slice pattern](https://zustand.docs.pmnd.rs/guides/slices-pattern), as long as the properties don't conflict.

```ts
import { create, StateCreator } from "zustand";
import { createTRPCZustand, InferStore } from "trpc-zustand";
import type { AppRouter } from "./server";

const trpc = createTRPCZustand<AppRouter>({
  /* ... */
});

// Use the InferStore utility to get the store's exact state type
type DeleteTodoSlice = InferStore<typeof deleteTodoStore>;

type AdditionalSlice = {
  foo: string;
  resetFoo: () => void;
};

const deleteTodoSlice = trpc.todos.deleteTodo.mutationStore();

const additionalSlice: StateCreator<
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
    ...deleteTodoSlice(...a),
    ...additionalSlice(...a)
  })
);
```

### Subscriptions

```tsx
const streamTodosStore = createStore(
  trpc.todos.streamTodos.subscriptionStore()
);

// Start a tRPC subscription
const stop = streamTodosStore.getState().subscribe(
  { listId },
  {
    onData: data => {
      console.log("New todo:", data);
    },
    onError: error => {
      console.error("Error:", error);
    }
  }
);

// Stop the subscription
stop();
```

```tsx
const useStreamTodosStore = create(trpc.todos.streamTodos.subscriptionStore());

function TodoStream({ listId }: { listId: string }) {
  const { status, data, error, subscribe } = useStreamTodosStore();

  useEffect(() => {
    // Start a tRPC subscription
    return subscribe({ listId });
  }, [listId]);

  return (
    <div>
      {error && <p>Error: {error.message}</p>}
      <p>
        ({status}) Latest todo: {data?.title}
      </p>
    </div>
  );
}
```

## API Reference

### Queries

#### Initialization options

| Property           | Type      | Description                                                                              |
| ------------------ | --------- | ---------------------------------------------------------------------------------------- |
| `enabled`          | `boolean` | Initially enable/disable the store. Optional. Defaults to `true`.                        |
| `keepPreviousData` | `boolean` | Keep the previous data while a new query is being fetched. Optional. Defaults to `true`. |

#### Store

| Property           | Type                           | Description                                                                                       |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                      | Tracks the store's enabled state.                                                                 |
| `keepPreviousData` | `boolean`                      | Tracks if the previous data should be kept while a new query is being fetched.                    |
| `input`            | `TInput \| undefined`          | The input of the last query.                                                                      |
| `loading`          | `boolean`                      | Tracks the query's loading state.                                                                 |
| `data`             | `TData \| undefined`           | The data returned by the last query.                                                              |
| `error`            | `TRPCClientError \| undefined` | The error thrown by the last query.                                                               |
| `enable`           | `() => void`                   | Enables the store.                                                                                |
| `disable`          | `() => void`                   | Disables the store.                                                                               |
| `toggle`           | `() => void`                   | Toggles the store's enabled state.                                                                |
| `reset`            | `() => void`                   | Resets the store.                                                                                 |
| `query`            | `(input, opts) => Promise`     | Fires a query. If there is an ongoing query, it is stopped and the new one is started.            |
| `refetch`          | `(opts) => Promise`            | Refetches the last query. If there is an ongoing query, it is stopped and the new one is started. |

### Mutations

#### Initialization options

| Property        | Type               | Description                                                                          |
| --------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `enabled`       | `boolean`          | Initially enable/disable the store. Optional. Defaults to `true`.                    |
| `refetchStores` | `() => StoreApi[]` | Calls the `refetch` method on the stores after the mutation is successful. Optional. |

#### Store

| Property  | Type                           | Description                                                                                  |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `enabled` | `boolean`                      | Tracks the store's enabled state.                                                            |
| `input`   | `TInput \| undefined`          | The input of the last mutation.                                                              |
| `loading` | `boolean`                      | Tracks the mutation's loading state.                                                         |
| `data`    | `TData \| undefined`           | The data returned by the last mutation.                                                      |
| `error`   | `TRPCClientError \| undefined` | The error thrown by the last mutation.                                                       |
| `enable`  | `() => void`                   | Enables the store.                                                                           |
| `disable` | `() => void`                   | Disables the store.                                                                          |
| `toggle`  | `() => void`                   | Toggles the store's enabled state.                                                           |
| `reset`   | `() => void`                   | Resets the store.                                                                            |
| `mutate`  | `(input, opts) => Promise`     | Fires a mutation. If there is an ongoing mutation, it is stopped and the new one is started. |

### Subscriptions

#### Initialization options

| Property  | Type      | Description                                                       |
| --------- | --------- | ----------------------------------------------------------------- |
| `enabled` | `boolean` | Initially enable/disable the store. Optional. Defaults to `true`. |

#### Store

| Property    | Type                                             | Description                                                           |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `enabled`   | `boolean`                                        | Tracks the store's enabled state.                                     |
| `input`     | `TInput \| undefined`                            | The input of the last subscription.                                   |
| `status`    | `"idle" \| "connecting" \| "pending" \| "error"` | Tracks the subscription's status.                                     |
| `data`      | `TData \| undefined`                             | The last data returned by the subscription.                           |
| `error`     | `TRPCClientError \| undefined`                   | The last error thrown by the subscription.                            |
| `enable`    | `() => void`                                     | Enables the store.                                                    |
| `disable`   | `() => void`                                     | Disables the store.                                                   |
| `toggle`    | `() => void`                                     | Toggles the store's enabled state.                                    |
| `reset`     | `() => void`                                     | Resets the store.                                                     |
| `subscribe` | `(input, opts) => () => void`                    | Subscribes to the last subscription. Returns a cancellation function. |

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any features, bug fixes, or improvements.

## License

[MIT](LICENSE)

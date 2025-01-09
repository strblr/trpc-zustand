import {
  type CreateTRPCClientOptions,
  TRPCClientError,
  type TRPCRequestOptions,
  TRPCUntypedClient
} from "@trpc/client";
import type {
  AnyTRPCMutationProcedure,
  AnyTRPCProcedure,
  AnyTRPCQueryProcedure,
  AnyTRPCSubscriptionProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferProcedureOutput,
  TRPCRouterRecord
} from "@trpc/server";
import type { StateCreator, StoreApi } from "zustand";

type DecoratedProcedureRecord<
  TRecord extends TRPCRouterRecord,
  TRouter extends AnyTRPCRouter
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends TRPCRouterRecord
    ? DecoratedProcedureRecord<TRecord[TKey], TRouter>
    : TRecord[TKey] extends AnyTRPCProcedure
    ? DecorateProcedure<TRecord[TKey], TRouter>
    : never;
};

type DecorateProcedure<
  TProcedure extends AnyTRPCProcedure,
  TRouter extends AnyTRPCRouter
> = TProcedure extends AnyTRPCQueryProcedure
  ? { queryStore: QueryStoreCreatorFactory<TProcedure, TRouter> }
  : TProcedure extends AnyTRPCMutationProcedure
  ? { mutationStore: MutationStoreCreatorFactory<TProcedure, TRouter> }
  : TProcedure extends AnyTRPCSubscriptionProcedure
  ? { subscriptionStore: SubscriptionStoreCreatorFactory<TProcedure, TRouter> }
  : never;

// Query

type QueryStoreCreatorFactory<
  TProcedure extends AnyTRPCQueryProcedure,
  TRouter extends AnyTRPCRouter
> = {
  (storeOpts?: QueryStoreOptions): QueryStoreCreator<TProcedure, TRouter>;
};

type QueryStoreOptions = {
  enabled?: boolean;
  keepPreviousData?: boolean;
};

type QueryStoreCreator<
  TProcedure extends AnyTRPCQueryProcedure,
  TRouter extends AnyTRPCRouter
> = StateCreator<{
  enabled: boolean;
  keepPreviousData: boolean;
  input: inferProcedureInput<TProcedure> | undefined;
  loading: boolean;
  data: inferProcedureOutput<TProcedure> | undefined;
  error: TRPCClientError<TRouter> | undefined;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  reset: () => void;
  query: (
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCRequestOptions
  ) => Promise<inferProcedureOutput<TProcedure>>;
  refetch: (
    opts?: TRPCRequestOptions
  ) => Promise<inferProcedureOutput<TProcedure>>;
}>;

// Mutation

type MutationStoreCreatorFactory<
  TProcedure extends AnyTRPCMutationProcedure,
  TRouter extends AnyTRPCRouter
> = {
  (storeOpts?: MutationStoreOptions): MutationStoreCreator<TProcedure, TRouter>;
};

type MutationStoreOptions = {
  enabled?: boolean;
  refetchStores?: () => StoreApi<{ refetch: () => Promise<any> }>[] | void;
};

type MutationStoreCreator<
  TProcedure extends AnyTRPCMutationProcedure,
  TRouter extends AnyTRPCRouter
> = StateCreator<{
  enabled: boolean;
  input: inferProcedureInput<TProcedure> | undefined;
  loading: boolean;
  data: inferProcedureOutput<TProcedure> | undefined;
  error: TRPCClientError<TRouter> | undefined;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  reset: () => void;
  mutate: (
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCRequestOptions
  ) => Promise<inferProcedureOutput<TProcedure>>;
}>;

// Subscription

type SubscriptionStoreCreatorFactory<
  TProcedure extends AnyTRPCSubscriptionProcedure,
  TRouter extends AnyTRPCRouter
> = {
  (storeOpts?: SubscriptionStoreOptions): SubscriptionStoreCreator<
    TProcedure,
    TRouter
  >;
};

type SubscriptionStoreOptions = {
  enabled?: boolean;
};

type SubscriptionStoreCreator<
  TProcedure extends AnyTRPCSubscriptionProcedure,
  TRouter extends AnyTRPCRouter
> = StateCreator<{
  enabled: boolean;
  input: inferProcedureInput<TProcedure> | undefined;
  status: "idle" | "connecting" | "pending" | "error";
  data: InferAsyncIterableYield<inferProcedureOutput<TProcedure>> | undefined;
  error: TRPCClientError<TRouter> | undefined;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  reset: () => void;
  subscribe: (
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCRequestOptions &
      Partial<{
        onStarted?: () => void;
        onData?: (
          data: InferAsyncIterableYield<inferProcedureOutput<TProcedure>>
        ) => void;
        onError?: (err: TRPCClientError<TRouter>) => void;
      }>
  ) => () => void;
}>;

// createTRPCZustand

export function createTRPCZustand<TRouter extends AnyTRPCRouter>(
  opts: CreateTRPCClientOptions<TRouter>
): DecoratedProcedureRecord<TRouter["_def"]["record"], TRouter> {
  const client = new TRPCUntypedClient<TRouter>(opts);
  const createProxy = (path: readonly string[] = []): any => {
    return new Proxy(() => {}, {
      get(_target, prop: string) {
        return createProxy([...path, prop]);
      },
      apply(_target, _thisArg, [storeOpts = {}]) {
        const op = path[path.length - 1];
        const opPath = path.slice(0, -1).join(".");
        switch (op) {
          case "queryStore":
            return queryStoreCreatorFactory(client, opPath, storeOpts);
          case "mutationStore":
            return mutationStoreCreatorFactory(client, opPath, storeOpts);
          case "subscriptionStore":
            return subscriptionStoreCreatorFactory(client, opPath, storeOpts);
        }
      }
    });
  };
  return createProxy();
}

// Store creator factories

function queryStoreCreatorFactory(
  client: TRPCUntypedClient<AnyTRPCRouter>,
  path: string,
  { enabled = true, keepPreviousData = true }: QueryStoreOptions
): QueryStoreCreator<AnyTRPCQueryProcedure, AnyTRPCRouter> {
  return (set, get) => {
    let stop = () => {};

    const initialState = {
      input: undefined,
      loading: false,
      data: undefined,
      error: undefined
    };

    return {
      enabled,
      keepPreviousData,
      ...initialState,
      enable: () => set({ enabled: true }),
      disable: () => {
        stop();
        set({ enabled: false, ...initialState });
      },
      toggle: () => {
        if (get().enabled) {
          get().disable();
        } else {
          get().enable();
        }
      },
      reset: () => {
        stop();
        set({ ...initialState });
      },
      query: async (input, opts) => {
        if (!get().enabled) {
          throw new Error("Query is disabled");
        }
        stop();
        let stopped = false;
        stop = () => {
          stopped = true;
        };
        set({
          input,
          loading: true,
          data: get().keepPreviousData ? get().data : undefined,
          error: undefined
        });
        try {
          const result = await client.query(path, input, opts);
          if (!stopped) {
            set({ loading: false, data: result });
          }
          return result;
        } catch (error) {
          if (!stopped) {
            set({ loading: false, error: error as any });
          }
          throw error;
        }
      },
      refetch: async opts => {
        return get().query(get().input, opts);
      }
    };
  };
}

function mutationStoreCreatorFactory(
  client: TRPCUntypedClient<AnyTRPCRouter>,
  path: string,
  { enabled = true, refetchStores }: MutationStoreOptions
): MutationStoreCreator<AnyTRPCMutationProcedure, AnyTRPCRouter> {
  return (set, get) => {
    let stop = () => {};

    const initialState = {
      input: undefined,
      loading: false,
      data: undefined,
      error: undefined
    };

    return {
      enabled,
      ...initialState,
      enable: () => set({ enabled: true }),
      disable: () => {
        stop();
        set({ enabled: false, ...initialState });
      },
      toggle: () => {
        if (get().enabled) {
          get().disable();
        } else {
          get().enable();
        }
      },
      reset: () => {
        stop();
        set({ ...initialState });
      },
      mutate: async (input, opts) => {
        if (!get().enabled) {
          throw new Error("Mutation is disabled");
        }
        stop();
        let stopped = false;
        stop = () => {
          stopped = true;
        };
        set({ input, loading: true, data: undefined, error: undefined });
        try {
          const result = await client.mutation(path, input, opts);
          if (!stopped) {
            set({ loading: false, data: result });
            refetchStores?.()?.forEach(store => store.getState().refetch());
          }
          return result;
        } catch (error) {
          if (!stopped) {
            set({ loading: false, error: error as any });
          }
          throw error;
        }
      }
    };
  };
}

function subscriptionStoreCreatorFactory(
  client: TRPCUntypedClient<AnyTRPCRouter>,
  path: string,
  { enabled = true }: SubscriptionStoreOptions
): SubscriptionStoreCreator<AnyTRPCSubscriptionProcedure, AnyTRPCRouter> {
  return (set, get) => {
    let stop = () => {};

    const initialState = {
      input: undefined,
      status: "idle",
      data: undefined,
      error: undefined
    } as const;

    return {
      enabled,
      ...initialState,
      enable: () => set({ enabled: true }),
      disable: () => {
        stop();
        set({ enabled: false, ...initialState });
      },
      toggle: () => {
        if (get().enabled) {
          get().disable();
        } else {
          get().enable();
        }
      },
      reset: () => {
        stop();
        set({ ...initialState });
      },
      subscribe: (input, { onStarted, onData, onError, ...opts } = {}) => {
        if (!get().enabled) {
          throw new Error("Subscription is disabled");
        }
        stop();
        set({ input, status: "connecting", data: undefined, error: undefined });
        stop = client.subscription(path, input, {
          ...opts,
          onStarted: () => {
            set({ status: "pending", error: undefined });
            onStarted?.();
          },
          onData: data => {
            set({ status: "pending", data, error: undefined });
            onData?.(data);
          },
          onError: error => {
            set({ status: "error", error });
            onError?.(error);
          },
          onConnectionStateChange: result => {
            set({ status: result.state, error: result.error ?? undefined });
          }
        }).unsubscribe;
        return stop;
      }
    };
  };
}

// Utils

export type InferStore<T> = T extends StateCreator<infer S, any, any, any>
  ? S
  : never;

export type InferAsyncIterableYield<T> = T extends AsyncIterable<infer U>
  ? U
  : T;

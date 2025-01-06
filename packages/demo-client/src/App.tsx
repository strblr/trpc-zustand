import { useEffect, useState } from "react";
import {
  useTodosStore,
  useAddTodoStore,
  useDeleteTodoStore,
  useStreamTodosStore
} from "./trpc";

export function App() {
  const [text, setText] = useState("");
  const [listId, setListId] = useState(1);
  const todos = useTodosStore();
  const streamEnabled = useStreamTodosStore(store => store.enabled);

  useEffect(() => {
    todos.query({ listId: String(listId) });
  }, [listId]);

  // useEffect(() => {
  //   return useStreamTodosStore.getState().subscribe(
  //     { listId: String(listId) },
  //     {
  //       onData: () =>
  //         console.log("Got data", useStreamTodosStore.getState().data)
  //     }
  //   );
  // }, [listId]);

  return (
    <>
      <div>
        <h1>Todo List {listId}</h1>
        <button
          disabled={listId === 1}
          onClick={() => setListId(prev => prev - 1)}
        >
          Previous list
        </button>
        <button onClick={() => setListId(prev => prev + 1)}>Next list</button>
        {todos.error ? (
          <p>Error: {todos.error.message}</p>
        ) : todos.loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {todos.data?.map(todo => (
              <li key={todo.id}>
                {todo.title}
                <button
                  onClick={() =>
                    useDeleteTodoStore.getState().mutate({ id: todo.id })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <input
          type="text"
          placeholder="New Todo"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && text.trim() !== "") {
              useAddTodoStore
                .getState()
                .mutate({ title: text, listId: String(listId) });
            }
          }}
        />
      </div>
      <button onClick={useStreamTodosStore.getState().toggle}>
        {streamEnabled ? "Disable" : "Enable"} stream
      </button>
    </>
  );
}

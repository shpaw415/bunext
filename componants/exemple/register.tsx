"use client";

import { useState } from "react";
import { ServerCreateUser } from ".";

export function Register({ content }: { content: string }) {
  const [state, set] = useState({
    username: "",
    password: "",
  });
  return (
    <>
      <div>
        <input
          type="text"
          onInput={(e) =>
            set({
              ...state,
              username: e.currentTarget.value,
            })
          }
        />
        <input
          type="password"
          onInput={(e) =>
            set({
              ...state,
              password: e.currentTarget.value,
            })
          }
        />
      </div>
      <button
        onClick={async () => {
          alert(
            await ServerCreateUser({
              username: state.username,
              password: state.password,
            })
          );
        }}
      >
        {content}
      </button>
    </>
  );
}

"use client";
import { useState } from "react";
import { GetSession } from "@bunpmjs/bunext/features/session";

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

export async function ServerCreateUser({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  Bun.sleepSync(1000); // some backend work
  GetSession(arguments).setData({
    username: username,
    password: password,
  });
  return `Data: ${username} with password: ${password} now registered`;
}

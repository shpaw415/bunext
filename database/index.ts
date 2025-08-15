"use client";

import type { _Users, SELECT_Users } from "./database_types.ts";

import { Table } from "./class";

export function Database() {

        return {
                Users: new Table<_Users, SELECT_Users>({ name: "Users" })
        } as const;

};

import { Database } from "../../../database";



export default function DatabasePage() {
    return (
        <div>
            <p>This page is dedicated to Testing Database Management.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => ServerhandleDatabaseAdd()}>Create Database</button>
                <button onClick={() => ServerhandleDatabaseDelete()}>Delete Database</button>
                <button onClick={() => ServerhandleDatabaseQuery().then(users => console.log(users))}>Query Database</button>
            </div>
        </div>
    );
}

export async function ServerhandleDatabaseAdd() {
    Database().Users.insert([{
        role: 'admin',
        password: "password",
        username: "testuser",
    }]);
}

export async function ServerhandleDatabaseDelete() {
    Database().Users.delete({ where: { username: "testuser" } });
}

export async function ServerhandleDatabaseQuery() {
    // This will now return only the username field with proper typing
    const res = Database().Users.select({
        where: { username: "testuser" },
    });

    res[0]


    const res2 = Database().Users.select({
        where: { username: "testuser" },
        select: { username: true }  // Specify only the fields you want
    });

    res2[0]

    return res;
}
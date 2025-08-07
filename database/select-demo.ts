import { Database } from "./index";

// Demo showing that select now returns only the selected fields
export function demonstrateSelectTyping() {
    const db = Database();

    // This should return all fields (full SELECT_FORMAT)
    const allUsers = db.Users.select();
    // Type: SELECT_Users[] (or whatever your SELECT_FORMAT is)

    // This should return only the selected fields with precise typing
    const usernames = db.Users.select({
        select: { username: true }
    });
    // Type: { username: string }[]

    // This should return multiple selected fields
    const userInfo = db.Users.select({
        select: { username: true, role: true }
    });
    // Type: { username: string; role: string }[]

    // This should still work for all fields
    const allUsersExplicit = db.Users.select({
        select: "*"
    });
    // Type: SELECT_Users[]

    // Test the returned data structure
    console.log("All users:", allUsers);
    console.log("Just usernames:", usernames);
    console.log("User info:", userInfo);

    // TypeScript should now know the exact shape of each result:
    // usernames[0] should only have 'username' property
    // userInfo[0] should only have 'username' and 'role' properties

    return {
        allUsers,
        usernames,
        userInfo,
        allUsersExplicit
    };
}

export type _Users = {
"id"?: number;
"username": string;
"password": string;
"role": ( "admin" | "user" );
"data"?: { "friends": Array<{ "username": string }>, "purchases"?: Array<{ "id": string, "type": ( "drink" | "food" | "other" ) }> };
"createdAt"?: Date;
};
export type SELECT_Users = {
"id"?: number;
"username": string;
"password": string;
"role": ( "admin" | "user" );
"data"?: { "friends": Array<{ "username": string }>, "purchases"?: Array<{ "id": string, "type": ( "drink" | "food" | "other" ) }> };
"createdAt": Date;
};
export type _Users = {
    id?: number;
    username: string;
    password: string;
    data?: { "friends": Array<{ "username": string }>, "purchases"?: Array<{ "id": string }> };
};
export type _purchase = {
    id?: number;
    price: number;
    quantity: number;
};
export type SELECT_Users = {
    id?: number;
    username: string;
    password: string;
    data?: { "friends": Array<{ "username": string }>, "purchases"?: Array<{ "id": string }> };
};
export type SELECT_purchase = {
    id?: number;
    price: number;
    quantity: number;
};
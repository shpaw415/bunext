export type _Users = {
  id: number;
  username: string;
  password: string;
  data?: {
    allo: { something: { inner: string }; else?: Array<number | string> };
  };
};
export type _purchase = {
  id: number;
  price: number;
  quantity: number;
};

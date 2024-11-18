/** equivalent as FromArray */
export type Unpacked<T> = T extends (infer U)[] ? U : T;
/** extract type from array */
export type FromArray<T> = Unpacked<T>;
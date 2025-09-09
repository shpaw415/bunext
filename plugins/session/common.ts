"server only";

export type SessionRecord = {
    id: string;
    data: SessionData<any>;
    createdAt?: number;
    lastAccessed?: number;
}

export type SessionData<T> = {
    public: Record<string, T>;
    private: Record<string, T> & {
        __BUNEXT_SESSION_CREATED_AT__?: number;
        __BUNEXT_SESSION_LAST_ACCESSED__?: number;
        __BUNEXT_SESSION_ID__?: string;
    };
};



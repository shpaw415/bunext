"server only";

export type SessionRecord = {
    id: string;
    data: SessionData<any>;
    createdAt?: number;
    lastAccessed?: number;
}

export type InitializedPrivateSessionData = {
    __BUNEXT_SESSION_CREATED_AT__: number;
    __BUNEXT_SESSION_LAST_ACCESSED__: number;
    __BUNEXT_SESSION_ID__: string;
    /**
     * Expiration set from international to be compared with Date.now()
     */
    __BUNEXT_SESSION_EXPIRATION__: number;
    __BUNEXT_RANDOM_ID__: string;
}

/**
 * Session data structure with improved type safety
 */
export type SessionData<T extends {}, initialized extends boolean = false> = {
    public: initialized extends true ? T : {};
    private: initialized extends true ? InitializedPrivateSessionData & T : {};
}



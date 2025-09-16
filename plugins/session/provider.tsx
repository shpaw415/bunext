import { useCallback, useEffect, useRef, useState } from "react";
import { BunextSession, GetSessionFromResponse, SessionContext, SessionDidUpdateContext } from "./client";
import { RouterLogger } from "internal/router";
import { AddServerActionCallback } from "plugins/server-features/server-action-client";
import type { InitializedPrivateSessionData } from "./common";



/**
 * Enhanced SessionProvider with intelligent session management and performance optimizations.
 * Manages user sessions with automatic cleanup, timeout handling, and sync across server actions.
 * 
 * @param children - React components to wrap with session context
 * @param config - Configuration options for session management
 * @param config.enableLogging - Enable debug logging (default: true in development)
 * @param config.autoCleanup - Automatically clean up expired sessions (default: true)
 * @param config.syncInterval - Interval for checking session updates in ms (default: 1000)
 * 
 * @example
 * // Basic usage
 * function App() {
 *   return (
 *     <SessionProvider>
 *       <RouterHost Shell={AppShell}>
 *         <HomePage />
 *       </RouterHost>
 *     </SessionProvider>
 *   );
 * }
 * 
 * // With custom configuration
 * function AppWithCustomSession() {
 *   return (
 *     <SessionProvider config={{
 *       enableLogging: false,
 *       autoCleanup: true,
 *       syncInterval: 2000
 *     }}>
 *       <App />
 *     </SessionProvider>
 *   );
 * }
 */
export function SessionProvider({
    children,
    config = {},
    session: _session
}: {
    children: React.ReactNode;
    config?: {
        enableLogging?: boolean;
    };
    session?: BunextSession<{}>;
}) {
    const {
        enableLogging = process.env.NODE_ENV === "development",
    } = config;

    const [updater, setUpdater] = useState(false);
    const session = useRef(_session || new BunextSession({
        updateFunction: setUpdater,
        enableLogging,
        sessionTimeout: globalThis.serverConfig.session?.timeout || 3600,
    }).init(globalThis.__PUBLIC_SESSION_DATA__ && globalThis.__SESSION_PRIVATE_INIT__ ? {
        private: globalThis.__SESSION_PRIVATE_INIT__ as InitializedPrivateSessionData,
        public: globalThis.__PUBLIC_SESSION_DATA__ ?? {}
    } : null)).current;


    if (!session.isInitialized()) {
        console.log("Initializing session in SessionProvider");
    }

    console.log("SessionProvider initialized", session.getMetadata());

    /*useReloadEffect(() => {
        if(session.isInitialized()) return;
        session.init();
    });*/

    //console.log("from <SessionProvider>", session.getData());

    const [sessionTimer, setSessionTimer] = useState<Timer>();
    const mountedRef = useRef(true);

    const timerSetter = useCallback(() => {
        if (!mountedRef.current) return;

        setSessionTimer((currentTimer) => {
            if (currentTimer) {
                clearTimeout(currentTimer);
            }

            // Priority 1: Use global session timeout from server response (it's a timestamp)
            const globalSessionTimeout = session.getExpiration();
            if (globalSessionTimeout && globalSessionTimeout > Date.now()) {
                const timeoutDuration = globalSessionTimeout - Date.now();

                RouterLogger.log("Setting session timer using global timeout", {
                    timeoutDuration,
                    globalTimeout: globalSessionTimeout,
                    currentTime: Date.now()
                });

                return setTimeout(() => {
                    if (mountedRef.current) {
                        try {
                            RouterLogger.log("Session expired (global timeout), cleaning up");
                            session.clientDelete();
                        } catch (error) {
                            RouterLogger.error("Failed to delete expired session", error);
                        }
                    }
                }, timeoutDuration);
            }
        });
    }, [session]);

    const addToServerActionCallback = useCallback(
        () =>
            AddServerActionCallback((res) => {
                if (!mountedRef.current) return;

                try {
                    RouterLogger.log("Received server response for session update");

                    // Get session data from response headers
                    const sessionData = GetSessionFromResponse(res);

                    if (sessionData?.timeout) {
                        RouterLogger.log("Received session timeout from server", {
                            timeout: sessionData.timeout,
                            currentTime: Date.now()
                        });

                    }

                    // Use the enhanced updateFromServerAction method
                    if (sessionData?.session && Object.keys(sessionData.session).length > 0) {
                        session.updateFromServerAction(sessionData.session, {
                            updateTimeout: sessionData.timeout,
                            triggerRerender: true
                        });

                        // Reset timer if we have a valid timeout
                        if (sessionData.timeout && sessionData.timeout > Date.now()) {
                            // Convert timestamp to seconds for setExpiration
                            const timeoutInSeconds = Math.floor((sessionData.timeout - Date.now()) / 1000);
                            session.setExpiration(timeoutInSeconds);
                            timerSetter();
                        } else if (sessionData.timeout) {
                            RouterLogger.warn("Received expired session timeout from server", {
                                timeout: sessionData.timeout,
                                currentTime: Date.now()
                            });
                        }
                    }
                    else {
                        RouterLogger.log("No session data received from server action");
                    }

                } catch (error) {
                    RouterLogger.error("Failed to update session from server response", error);
                }
            }, "update_session_callback"),
        [session, timerSetter]
    );

    useEffect(() => {
        mountedRef.current = true;
        addToServerActionCallback();

        // Immediate check for session data that might already be available
        if (globalThis.__PUBLIC_SESSION_DATA__ && Object.keys(globalThis.__PUBLIC_SESSION_DATA__).length > 0) {
            RouterLogger.log("Session data immediately available from script tag", {
                keys: Object.keys(globalThis.__PUBLIC_SESSION_DATA__)
            });

            const sessionData = globalThis.__PUBLIC_SESSION_DATA__;
            const sessionTimeout = globalThis.__SESSION_PRIVATE_INIT__?.__BUNEXT_SESSION_EXPIRATION__;

            // Update session and trigger rerender
            session.updateFromServerAction(sessionData, {
                updateTimeout: sessionTimeout,
                triggerRerender: true
            });

            // Set up timer if we have a valid timeout
            if (sessionTimeout && sessionTimeout > Date.now()) {
                timerSetter();
            }

            // Skip the polling since we already have data
            return () => {
                mountedRef.current = false;
                if (sessionTimer) {
                    clearTimeout(sessionTimer);
                }
            };
        }

        return () => {
            mountedRef.current = false;
        };
    }, [addToServerActionCallback, timerSetter, session]);

    return (
        <SessionContext value={session}>
            <SessionDidUpdateContext value={updater}>
                {children}
            </SessionDidUpdateContext>
        </SessionContext>
    );
}
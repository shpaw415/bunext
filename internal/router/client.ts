import type { RoutesType } from "plugins/typed-route/type";
import { unstable_batchedUpdates } from "react-dom";


// Event constants for better maintainability
const eventPopstate = "popstate" as const;
const eventPushState = "pushState" as const;
const eventReplaceState = "replaceState" as const;
export const events = [eventPopstate, eventPushState, eventReplaceState] as const;

/**
 * Programmatically navigate to a different route with type safety.
 * Updates browser history and triggers route changes in the application.
 * 
 * @param to - The route path to navigate to (typed with RoutesType)
 * @param options - Navigation options
 * @param options.replace - Whether to replace current history entry instead of pushing new one
 * 
 * @example
 * // Basic navigation
 * navigate('/dashboard');
 * 
 * // Replace current history entry
 * navigate('/login', { replace: true });
 * 
 * // Navigate with query parameters
 * navigate('/search?q=react');
 * 
 * // Navigate in event handlers
 * function LoginButton() {
 *   const handleLogin = async () => {
 *     await loginUser();
 *     navigate('/dashboard');
 *   };
 *   
 *   return <button onClick={handleLogin}>Login</button>;
 * }
 */
export const navigate = (
    to: RoutesType,
    options: { replace?: boolean } = { replace: false }
): void => {
    const method = options.replace ? eventReplaceState : eventPushState;

    try {
        history[method](null, "", to);
    } catch (error) {
        console.error("Navigation failed:", error);
        // Fallback to location assignment
        if (options.replace) {
            location.replace(to);
        } else {
            location.assign(to);
        }
    }
};

declare global {
    var __INIT_HISTORY__: boolean;
}
globalThis.__INIT_HISTORY__ ??= false;

if (typeof history !== "undefined" && !globalThis.__INIT_HISTORY__) {
    globalThis.__INIT_HISTORY__ = true;
    for (const type of [eventPushState, eventReplaceState] as const) {
        const original = history[type];

        history[type] = function (...args: Parameters<typeof original>) {
            try {
                const result = original.apply(this, args);
                const event = new Event(type);

                unstable_batchedUpdates(() => {
                    dispatchEvent(event);
                });

                return result;
            } catch (error) {
                console.error(`History ${type} failed:`, error);
                throw error;
            }
        };
    }
}

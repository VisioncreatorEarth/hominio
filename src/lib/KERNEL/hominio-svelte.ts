import { writable, readable, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { subscribeToDbChanges } from './hominio-db';
import { executeQuery as coreExecuteQuery } from './hominio-query/index';
import { executeMutation as coreExecuteMutation } from './hominio-mutate';
import { authClient as coreAuthClient, getMe as coreGetMe } from './hominio-auth';
import type {
    LoroHqlQueryExtended as CoreLoroHqlQueryExtended,
    QueryResult as CoreQueryResult,
    MutateHqlRequest,
    MutationResult,
    CapabilityUser
} from './hominio-types';

// --- Internal State ---

// Internal notifier triggered by general DB changes
const svelteNotifier = writable(0);

// Internal store to hold the current user state for facade functions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const currentUser = readable<CapabilityUser | null>(null, (set) => {
    let unsubscribeSession: (() => void) | null = null;
    if (browser) {
        try {
            const sessionStore = coreAuthClient.useSession();
            unsubscribeSession = sessionStore.subscribe((session) => {
                set(session.data?.user as CapabilityUser ?? null);
            });
            // Initial value
            set(get(sessionStore).data?.user as CapabilityUser ?? null);
        } catch (e) {
            console.error("[hominio-svelte] Error subscribing to session store:", e);
            set(null); // Set to null on error
        }
    } else {
        set(null); // No user session on server initially
    }

    return () => {
        unsubscribeSession?.();
    };
});


// --- Subscribe internal Svelte notifier to generic DB changes ---
if (browser) {
    try {
        // Subscribe svelteNotifier to the generic pub/sub from hominio-db
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const unsubscribeDbChanges = subscribeToDbChanges(() => {
            // Debounce or directly update? Let's directly update for now.
            svelteNotifier.update(n => n + 1);
            // console.log("[hominio-svelte] Internal svelteNotifier updated via DB change."); // Optional Debug
        });
        // TODO: Consider lifecycle management for unsubscribeDbChanges if needed (e.g., on app close)
    } catch (e) {
        console.error("[hominio-svelte] Error subscribing internal notifier to DB changes:", e);
    }
}


// --- Exported Facade Functions (Keep implementations) ---

async function executeQueryFacade(query: CoreLoroHqlQueryExtended): Promise<CoreQueryResult[]> {
    const user = get(currentUser);
    const results = await coreExecuteQuery(query, user);
    return results;
}

function processReactiveQueryFacade(
    queryDefinitionStore: Readable<CoreLoroHqlQueryExtended | null>
): Readable<CoreQueryResult[] | null | undefined> {
    const queryDefStringForId = JSON.stringify(get(queryDefinitionStore));
    const queryIdentifier = queryDefStringForId.length > 50 ? queryDefStringForId.substring(0, 50) + '...' : queryDefStringForId;

    if (!browser) {
        // --- Server-Side Rendering (SSR) Handling ---
        const initialQuery = get(queryDefinitionStore);
        console.warn(`[processReactiveQuery SSR ${queryIdentifier}] Executing query without user context.`);
        return readable<CoreQueryResult[] | null | undefined>(undefined, (set) => {
            if (!initialQuery) { set([]); return; }
            coreExecuteQuery(initialQuery, null)
                .then(results => { set(results); })
                .catch(err => { console.error(`[processReactiveQuery SSR ${queryIdentifier}] Query error:`, err); set(null); });
        });
    }

    // --- Client-Side Reactive Logic ---
    return readable<CoreQueryResult[] | null | undefined>(undefined, (set) => {
        let debounceTimer: NodeJS.Timeout | null = null;
        const DEBOUNCE_MS = 50;
        let lastQueryDefinitionString: string | null = null;
        let currentResults: CoreQueryResult[] | null | undefined = undefined;
        let userSubscription: (() => void) | null = null;
        let notifierSubscription: (() => void) | null = null;

        const triggerDebouncedQuery = (reason: string) => {
            const currentQueryDefinition = get(queryDefinitionStore);
            if (!currentQueryDefinition || !Array.isArray(currentQueryDefinition.steps)) {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = null;
                if (currentResults !== undefined && currentResults !== null && currentResults.length > 0) {
                    set([]);
                    currentResults = [];
                } else if (currentResults === undefined) {
                    set([]);
                    currentResults = [];
                }
                lastQueryDefinitionString = JSON.stringify(currentQueryDefinition);
                return;
            }

            const queryDefString = JSON.stringify(currentQueryDefinition);
            const queryChanged = lastQueryDefinitionString !== queryDefString;
            lastQueryDefinitionString = queryDefString;

            if (reason !== 'DB Change Notifier' && !queryChanged && currentResults !== undefined) {
                return;
            }

            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            if (currentResults === undefined || queryChanged) {
                if (currentResults !== undefined) {
                    set(undefined);
                }
            }

            debounceTimer = setTimeout(async () => {
                const user = get(currentUser);
                const latestQueryDefinition = get(queryDefinitionStore);
                const latestQueryDefString = JSON.stringify(latestQueryDefinition);

                if (!latestQueryDefinition || !Array.isArray(latestQueryDefinition.steps) || latestQueryDefString !== lastQueryDefinitionString) {
                    return;
                }

                try {
                    if (currentResults !== undefined) {
                        set(undefined);
                    }
                    currentResults = undefined;

                    const results = await coreExecuteQuery(latestQueryDefinition, user);

                    // <<< DEBUG LOG START >>>
                    console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Raw results received from coreExecuteQuery:`, JSON.stringify(results));
                    // <<< DEBUG LOG END >>>

                    // <<< FIX: Assign results directly, no longer need to extract 'variables' >>>
                    const finalResults = results;

                    // <<< DUPLICATE CHECK START >>>
                    if (Array.isArray(finalResults)) {
                        // Check 'id' on the top-level item (should be correct now)
                        const ids = finalResults.map(item => item?.id ?? JSON.stringify(item)).filter(id => id);
                        const uniqueIds = new Set(ids);
                        if (ids.length !== uniqueIds.size) {
                            console.error(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Duplicate IDs DETECTED BEFORE set(results)! IDs:`, ids);
                            // Optionally handle the error, e.g., filter duplicates or set an error state
                        } else {
                            console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] IDs verified unique before set(results). Count: ${ids.length}`);
                        }
                    }
                    // <<< DUPLICATE CHECK END >>>

                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) {
                        return; // Query definition changed while query was running, discard result
                    }

                    // <<< DEBUG LOG START >>>
                    console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Setting results:`, JSON.stringify(finalResults));
                    if (Array.isArray(finalResults)) {
                        const ids = finalResults.map(r => r?.id ?? JSON.stringify(r)).filter(id => id);
                        const uniqueIds = new Set(ids);
                        if (ids.length !== uniqueIds.size) {
                            console.error(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Duplicate IDs found BEFORE set(results)!`, ids);
                        }
                    }
                    // <<< DEBUG LOG END >>>

                    set(finalResults);
                    currentResults = finalResults;
                } catch (error) {
                    console.error(`[processReactiveQueryFacade ${queryIdentifier}] Error during executeQuery:`, error);
                    if (JSON.stringify(get(queryDefinitionStore)) === lastQueryDefinitionString) {
                        // <<< DEBUG LOG START >>>
                        console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Setting null due to error.`);
                        // <<< DEBUG LOG END >>>
                        set(null);
                        currentResults = null;
                    }
                }
            }, DEBOUNCE_MS);
        };

        // Add logging for other set calls
        const unsubscribeQueryDef = queryDefinitionStore.subscribe(newQueryDef => {
            const newQueryDefString = JSON.stringify(newQueryDef);
            if (lastQueryDefinitionString !== newQueryDefString || currentResults === undefined) {
                // <<< DEBUG LOG START >>>
                console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Query definition changed or initial load, triggering query.`);
                // <<< DEBUG LOG END >>>
                triggerDebouncedQuery('Query Definition Changed or Initial Load');
            }
        });

        notifierSubscription = svelteNotifier.subscribe(() => {
            // <<< DEBUG LOG START >>>
            console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] DB change notifier triggered, re-running query.`);
            // <<< DEBUG LOG END >>>
            triggerDebouncedQuery('DB Change Notifier');
        });

        userSubscription = currentUser.subscribe((/* newUser */) => {
            if (currentResults !== undefined) {
                // <<< DEBUG LOG START >>>
                console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] User changed, re-running query.`);
                // <<< DEBUG LOG END >>>
                triggerDebouncedQuery('User Change');
            }
        });

        lastQueryDefinitionString = JSON.stringify(get(queryDefinitionStore));
        currentResults = undefined;
        // <<< DEBUG LOG START >>>
        console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Initial setup. QueryDef: ${lastQueryDefinitionString}`);
        // <<< DEBUG LOG END >>>

        if (get(queryDefinitionStore) && Array.isArray(get(queryDefinitionStore)?.steps)) {
            // <<< DEBUG LOG START >>>
            console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Triggering initial query on mount.`);
            // <<< DEBUG LOG END >>>
            triggerDebouncedQuery('Initial Mount');
        } else {
            // <<< DEBUG LOG START >>>
            console.log(`[processReactiveQueryFacade DEBUG ${queryIdentifier}] Initial query definition invalid or missing, setting empty array.`);
            // <<< DEBUG LOG END >>>
            set([]);
            currentResults = [];
        }

        return () => {
            unsubscribeQueryDef();
            notifierSubscription?.();
            userSubscription?.();
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });
}

async function executeMutationFacade(request: MutateHqlRequest): Promise<MutationResult> {
    const user = get(currentUser);
    const result = await coreExecuteMutation(request, user);
    return result;
}

// --- Export Single Object ---
export const o = {
    query: executeQueryFacade,
    subscribe: processReactiveQueryFacade,
    mutate: executeMutationFacade,
    me: coreGetMe,
    authClient: coreAuthClient
};

// --- Export renamed types needed externally ---
// These need to be exported *after* the `o` object
export type { CoreLoroHqlQueryExtended as LoroHqlQueryExtended, CoreQueryResult as QueryResult };

// Add other facade functions as needed 
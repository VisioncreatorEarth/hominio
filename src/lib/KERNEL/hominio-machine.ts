import { writable } from 'svelte/store';

/**
 * Configuration interface for the state machine
 * @template TContext - Type of the machine's context
 * @template TState - Type of the machine's states (must be a string)
 * @template TEvent - Type of events the machine can handle (must be a string)
 */
export interface MachineConfig<TContext, TState extends string, TEvent extends string> {
    /** Unique identifier for the machine instance */
    id: string;
    /** Initial state of the machine */
    initial: TState;
    /** Initial context data */
    context: TContext;
    /** State configuration object */
    states: {
        [K in TState]: {
            /** Actions to execute when entering this state */
            entry?: string[];
            /** Actions to execute when exiting this state */
            exit?: string[];
            /** Event handlers for this state */
            on?: {
                [E in TEvent]?: {
                    /** Target state to transition to */
                    target: TState;
                    /** Optional guard function name to check before transition */
                    guard?: string;
                    /** Actions to execute during transition */
                    actions?: string[];
                }[] | {
                    target: TState;
                    guard?: string;
                    actions?: string[];
                };
            };
        };
    };
}

/**
 * Interface representing the current state of the machine
 * @template TContext - Type of the machine's context
 * @template TState - Type of the machine's states
 */
export interface MachineState<TContext, TState extends string> {
    /** Current state value */
    value: TState;
    /** Current context data */
    context: TContext;
    /** Reference to the machine configuration */
    config: MachineConfig<TContext, TState, string>;
}

/**
 * Interface for guard functions that control state transitions
 * @template TContext - Type of the machine's context
 */
export interface Guards<TContext> {
    /** Map of guard function names to their implementations */
    [key: string]: (context: TContext) => boolean;
}

/**
 * Interface for action functions that execute during state transitions
 * @template TContext - Type of the machine's context
 */
export interface Actions<TContext> {
    /** Map of action function names to their implementations */
    [key: string]: (context: TContext) => void | Promise<void>;
}

/**
 * Creates a new state machine instance
 * @template TContext - Type of the machine's context (must extend Record<string, any>)
 * @template TState - Type of the machine's states (must be a string)
 * @template TEvent - Type of events the machine can handle (must be a string)
 * 
 * @param config - Machine configuration object
 * @param actions - Object containing action implementations
 * @param guards - Object containing guard implementations
 * 
 * @returns A state machine instance with subscribe, send, getState, and reset methods
 * 
 * @example
 * ```typescript
 * const machine = createMachine(
 *   {
 *     id: 'toggle',
 *     initial: 'off',
 *     context: { count: 0 },
 *     states: {
 *       off: {
 *         on: { TOGGLE: { target: 'on', actions: ['increment'] } }
 *       },
 *       on: {
 *         on: { TOGGLE: { target: 'off' } }
 *       }
 *     }
 *   },
 *   {
 *     increment: (context) => { context.count++ }
 *   },
 *   {}
 * );
 * ```
 */
export function createMachine<
    TContext extends Record<string, any>,
    TState extends string,
    TEvent extends string
>(
    config: MachineConfig<TContext, TState, TEvent>,
    actions: Actions<TContext>,
    guards: Guards<TContext>
) {
    // Create a Svelte store for the machine state
    const { subscribe, set, update } = writable<MachineState<TContext, TState>>({
        value: config.initial,
        context: config.context,
        config: config as MachineConfig<TContext, TState, string>
    });

    /**
     * Sends an event to the machine, triggering state transitions
     * @param event - The event to send to the machine
     */
    function send(event: TEvent) {
        update((state) => {
            const currentStateConfig = state.config.states[state.value];
            const transitions = currentStateConfig?.on?.[event];

            if (transitions) {
                // Handle both single transition and transition array cases
                const transition = Array.isArray(transitions)
                    ? transitions.find((t) => !t.guard || guards[t.guard]?.(state.context))
                    : transitions;

                if (transition) {
                    const target = transition.target;

                    // Execute state exit actions
                    currentStateConfig?.exit?.forEach((action) => actions[action]?.(state.context));

                    // Execute transition actions
                    transition.actions?.forEach((action) => actions[action]?.(state.context));

                    // Execute state entry actions
                    const newStateConfig = state.config.states[target];
                    newStateConfig?.entry?.forEach((action) => actions[action]?.(state.context));

                    return {
                        ...state,
                        value: target
                    };
                }
            }
            return state;
        });
    }

    /**
     * Returns the current state of the machine
     * @returns The current MachineState
     */
    function getState() {
        let currentState: MachineState<TContext, TState>;
        subscribe((state) => {
            currentState = state;
        })();
        return currentState!;
    }

    /**
     * Resets the machine to its initial state and context
     */
    function reset() {
        set({ value: config.initial, context: config.context, config });
        const initialStateConfig = config.states[config.initial];
        initialStateConfig?.entry?.forEach((actionName) => actions[actionName]?.(config.context));
    }

    // Initialize the machine by running initial state entry actions
    const initialStateConfig = config.states[config.initial];
    initialStateConfig?.entry?.forEach((actionName) => actions[actionName]?.(config.context));

    // Return the machine interface
    return {
        subscribe,
        send,
        getState,
        reset
    };
} 
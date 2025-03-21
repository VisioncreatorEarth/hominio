<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext } from 'svelte';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { loroPGLiteStorage } from '$lib/stores/loroPGLiteStorage';
	import { LoroDoc } from 'loro-crdt';
	import { generateUUID, generateShortUUID } from '$lib/utils/uuid';
	import {
		startCall,
		endCall,
		toggleMute,
		UltravoxSessionStatus,
		Role,
		type Transcript
	} from '$lib/ultravox/callFunctions';
	import CallInterface from '$lib/components/CallInterface.svelte';
	import { currentAgent } from '$lib/ultravox/toolImplementation';
	import { agentTools } from '$lib/ultravox/callFunctions';

	// Disable Server-Side Rendering since Tauri is client-only
	export const ssr = false;

	// Context keys
	const LORO_STORAGE_KEY = 'loro-storage';
	const LORO_DOCS_KEY = 'loro-docs';
	const STORAGE_INFO_KEY = 'storage-info';

	// Constants
	const MAX_INIT_ATTEMPTS = 5;

	// Global state - use let for variables we need to update
	let isInitializing = $state(false);
	let initAttempts = $state(0);
	let activeDocumentsCount = $state(0);
	let clientId = $state(generateShortUUID());
	let isStorageInitialized = $state(false);
	let isCallActive = $state(false);
	let callStatus = $state<string>('off');
	let transcripts = $state<Transcript[]>([]);

	// Loro document registry
	let loroDocsRegistry = $state<Record<string, { doc: LoroDoc }>>({});

	// Global state for notifications
	let recentToolActivity = $state<{ action: string; message: string; timestamp: number } | null>(
		null
	);

	// Use effect to monitor window.__recentToolActivity for changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			// Set up interval to check for notifications
			const checkInterval = setInterval(() => {
				const windowActivity = (window as any).__recentToolActivity;
				if (windowActivity) {
					recentToolActivity = windowActivity;
				}
			}, 300);

			// Clear interval on cleanup
			return () => clearInterval(checkInterval);
		}
	});

	// Toggle modal state
	async function toggleCall() {
		if (isCallActive) {
			await handleEndCall();
		} else {
			await handleStartCall();
		}
	}

	// Handle starting a call
	async function handleStartCall() {
		try {
			const callConfig = {
				systemPrompt: `You are Hominio, a personal assistant for the user.

You have access to the following tools that you MUST use when relevant:

1. createTodo - Creates a new todo item
   Parameters:
     - todoText: string (REQUIRED) - The text content of the todo to create
     - tags: string (REQUIRED) - Comma-separated list of tags (e.g. "work,home,urgent")
     - listName: string (OPTIONAL) - The list to add the todo to (default is personal list)
   When to use: Whenever a user asks to create, add, or make a new task/todo
   Example usage: createTodo({"todoText": "buy groceries", "tags": "shopping,errands", "listName": "personal"})

2. toggleTodo - Toggles a todo's completion status
   Parameters (at least one is REQUIRED):
     - todoId: string (OPTIONAL) - The ID of the todo to toggle
     - todoText: string (OPTIONAL) - Text to search for in todos
   When to use: Whenever a user asks to mark, toggle, complete, or finish a task
   Example usage: toggleTodo({"todoText": "groceries"})
   
3. removeTodo - Deletes a todo from the list
   Parameters (at least one is REQUIRED):
     - todoId: string (OPTIONAL) - The ID of the todo to remove
     - todoText: string (OPTIONAL) - Text to search for in todos
   When to use: Whenever a user asks to delete, remove, or erase a task
   Example usage: removeTodo({"todoText": "groceries"})

4. updateTodo - Updates a todo's text or tags
   Parameters:
     - todoId: string (OPTIONAL) - The ID of the todo to update
     - todoText: string (OPTIONAL) - Current text to search for (if todoId not provided)
     - newText: string (REQUIRED) - The new text content for the todo
     - tags: string (OPTIONAL) - Comma-separated list of new tags
   When to use: Whenever a user asks to edit, update, modify, or change an existing todo
   Example usage: updateTodo({"todoText": "buy milk", "newText": "buy almond milk", "tags": "shopping,health"})

5. filterTodos - Filters todos by tag
   Parameters:
     - tag: string (REQUIRED) - The tag to filter by, or "all" to show all todos
   When to use: Whenever a user asks to filter, show, or display todos with specific tags
   Example usage: filterTodos({"tag": "shopping"}) or filterTodos({"tag": "all"})

6. createList - Creates a new todo list
   Parameters:
     - listName: string (REQUIRED) - The name for the new list
   When to use: Whenever a user asks to create, add, or make a new list
   Example usage: createList({"listName": "Work Tasks"})

7. switchList - Switches to a different todo list
   Parameters:
     - listName: string (REQUIRED) - The name of the list to switch to
   When to use: Whenever a user asks to switch to, view, or open a different list
   Example usage: switchList({"listName": "Personal"})

8. switchAgent - Switch to a different personality
   Parameters:
     - agentName: string (REQUIRED) - The name of the agent to switch to
   When to use: Whenever a user asks to speak to a different agent or assistant
   Example usage: switchAgent({"agentName": "Mark"})

Available Agents:
- Mark: enthusiastic and playful (formerly known as Ali)
- Emily: calm and methodical (formerly known as Sam)
- Oliver: professional and efficient (formerly known as Taylor)

IMPORTANT INSTRUCTIONS:
1. You MUST use these tools directly without asking for confirmation
2. Call the appropriate tool as soon as a user requests to create, toggle, delete, update, filter, or manage lists
3. Execute the tool when needed WITHOUT typing out the function in your response
4. AFTER the tool executes, respond with text confirming what you did
5. DO NOT tell the user "I'll use the tool" - just USE it directly
6. ALWAYS add tags to todos automatically based on the content:
   - For time-sensitive items, add "urgent" or "important"
   - If the user specifies specific tags, use those instead of or in addition to your automatic tags
7. For lists, default to the "Personal List" if no list is specified
8. When creating a todo, you can specify which list it should go in, and a new list will be created if it doesn't exist
9. When filtering todos, use the exact tag the user mentions or "all" to show all todos
10. When a user asks to switch to a different personality or persona or they want to speak to Mark, Emily, or Oliver specifically, use the switchAgent tool
11. Note that Mark was formerly known as Ali, Emily was formerly known as Sam, and Oliver was formerly known as Taylor, so handle these legacy names appropriately

Be friendly, concise, and helpful. Keep responses under 3 sentences when possible.`,
				model: 'fixie-ai/ultravox-70B',
				voice: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae', // Jessica voice ID
				languageHint: 'en', // English language hint
				temperature: 0.7
			};

			await startCall(
				{
					onStatusChange: (status) => {
						callStatus = status || 'unknown';
						isCallActive =
							status !== 'disconnected' && status !== 'call_ended' && status !== 'error';

						// Log status changes but don't try to register tools here
						if (isCallActive) {
							console.log('📱 Call is now active with status:', status);
						}
					},
					onTranscriptChange: (newTranscripts) => {
						if (newTranscripts) {
							transcripts = [...newTranscripts];
						}
					}
				},
				callConfig
			);
		} catch (error) {
			console.error('Failed to start call:', error);
		}
	}

	// Handle ending a call
	async function handleEndCall() {
		try {
			await endCall();
			isCallActive = false;
			callStatus = 'off';
			transcripts = [];
		} catch (error) {
			console.error('Failed to end call:', error);
		}
	}

	// Initialize storage
	async function initializeStorage() {
		if (isInitializing) {
			return false;
		}

		isInitializing = true;
		initAttempts++;

		try {
			// Direct call to initialize the storage system
			await loroPGLiteStorage.initialize();

			// Update storage state after initialization
			isStorageInitialized = true;

			// Set the client ID for identification
			if (typeof window !== 'undefined') {
				(window as any).__CLIENT_ID = clientId;
			}

			isInitializing = false;
			return true;
		} catch (error) {
			// Update state with error information
			isStorageInitialized = false;
			console.error('Storage initialization failed:', error);

			isInitializing = false;
			return false;
		}
	}

	// Create a simple store pattern for reactivity
	function createStore<T>(initialValue: T) {
		const subscribers = new Set<(value: T) => void>();
		let value = initialValue;

		return {
			subscribe(callback: (value: T) => void) {
				// Call immediately with current value
				callback(value);

				// Add to subscribers
				subscribers.add(callback);

				// Return unsubscribe function
				return () => {
					subscribers.delete(callback);
				};
			},
			set(newValue: T) {
				if (value === newValue) return;
				value = newValue;

				// Notify all subscribers
				subscribers.forEach((callback) => callback(value));
			},
			update(updater: (value: T) => T) {
				this.set(updater(value));
			}
		};
	}

	// Set up effects for reactivity
	$effect(() => {
		// Update active documents count when the registry changes
		activeDocumentsCount = Object.keys(loroDocsRegistry).length;
	});

	// Create the storage info object for context
	function getStorageInfo() {
		return {
			isInitialized: isStorageInitialized,
			clientId
		};
	}

	// Create stores for context
	const loroDocsStore = createStore(loroDocsRegistry);
	const storageInfoStore = createStore(getStorageInfo());

	// Keep stores in sync with state
	$effect(() => {
		loroDocsStore.set(loroDocsRegistry);
	});

	// Track individual state properties to ensure reactivity
	$effect(() => {
		// Reference the state variables directly so they're tracked
		const info = {
			isInitialized: isStorageInitialized,
			clientId
		};
		storageInfoStore.set(info);
	});

	// Set context for child components
	setContext(LORO_STORAGE_KEY, loroStorage);
	setContext(LORO_DOCS_KEY, loroDocsStore);
	setContext(STORAGE_INFO_KEY, storageInfoStore);

	// Perform immediate initialization before mounting
	// This helps ensure storage is ready before child components need it
	if (typeof window !== 'undefined') {
		initializeStorage();
	}

	// Initialize on mount
	onMount(() => {
		// If storage isn't initialized yet, try again
		if (!isStorageInitialized) {
			initializeStorage().catch((error) => {
				console.error('Failed to initialize Loro storage:', error);
			});
		}

		// Make available for debugging
		(window as any).loroStorage = loroStorage;
		(window as any).loroDocsRegistry = loroDocsRegistry;

		// Setup polling to retry initialization if needed
		const checkStorageStatus = () => {
			// Retry initialization if needed
			if (!isStorageInitialized && initAttempts < MAX_INIT_ATTEMPTS && !isInitializing) {
				initializeStorage();
			}
		};

		// Poll for storage state changes
		const interval = setInterval(checkStorageStatus, 3000);

		// Return a cleanup function
		return () => {
			clearInterval(interval);
		};
	});

	// Clean up on component destruction
	onDestroy(() => {
		// Clean up registry
		loroDocsRegistry = {};

		// End any active call
		if (isCallActive) {
			handleEndCall();
		}
	});

	// Use $effect instead of $: for reactivity in Svelte 5 runes
	$effect(() => {
		if (callStatus === 'active' && typeof window !== 'undefined') {
			console.log(
				'�� Call became active - tools should already be registered in startCall function'
			);
			// No tool registration here - it's already handled in callFunctions.ts:startCall
		}
	});

	let { children } = $props();
</script>

<div
	class="relative min-h-screen w-full overflow-hidden bg-cover bg-center text-white"
	style="background-image: url('/bg.jpg');"
>
	<!-- Overlay gradient - reduced opacity -->
	<div
		class="absolute inset-0 bg-gradient-to-b from-blue-950/70 to-indigo-950/70 backdrop-blur-[2px]"
	></div>

	<!-- Background circles/shapes for design - increased transparency -->
	<div class="absolute top-20 right-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl"></div>
	<div class="absolute bottom-40 left-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"></div>

	<!-- Main Content Container -->
	<div class="relative z-10 flex h-screen flex-col">
		<!-- Header with Navigation - more transparent -->
		<!-- <header class="border-b border-white/5 bg-white/5 backdrop-blur-md">
			<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="flex h-16 items-center justify-between">
					<div class="flex items-center">
						<div class="flex-shrink-0">
							<a href="/" class="flex items-center">
								<span class="text-xl font-medium text-white/95">homin.io</span>
							</a>
						</div>
						<nav class="ml-10 flex items-baseline space-x-4">
							<a
								href="/hominio"
								class="rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
							>
								Hominio
							</a>
							<a
								href="/todos"
								class="rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
							>
								Todos
							</a>
							<a
								href="/docs"
								class="rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
							>
								Docs
							</a>
						</nav>
					</div>

					<div class="flex items-center gap-2">
						<span
							class={`inline-block h-2 w-2 rounded-full ${isStorageInitialized ? 'bg-emerald-400' : 'bg-red-400'}`}
						></span>
						<span class="text-xs text-white/70">
							{isStorageInitialized ? 'Storage Ready' : 'Initializing Storage...'}
						</span>
					</div>
				</div>
			</div>
		</header> -->

		<!-- Main Content -->
		<main class="flex-1 overflow-auto">
			<div class="mx-auto w-full">
				<!-- Slot for page content -->
				{@render children()}
			</div>
		</main>

		<!-- Centered Logo Button - more transparent -->
		<div class="fixed bottom-0 left-1/2 z-50 -translate-x-1/2">
			{#if !isCallActive}
				<button
					class="flex h-16 w-16 transform items-center justify-center rounded-full bg-white/5 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/10 focus:outline-none"
					onclick={toggleCall}
				>
					<div class="h-12 w-12 overflow-hidden rounded-full bg-white/5 p-1">
						<img src="/logo.png" alt="Hominio Logo" class="h-full w-full object-cover" />
					</div>
				</button>
			{/if}
		</div>

		<!-- Call Interface - When Call is Active -->
		{#if isCallActive}
			<CallInterface
				{callStatus}
				{transcripts}
				onEndCall={handleEndCall}
				notification={recentToolActivity}
			/>
		{/if}
	</div>
</div>

<style lang="postcss">
	:global(body) {
		margin: 0;
		padding: 0;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
		color-scheme: dark;
	}

	/* Custom scrollbar styling */
	:global(*::-webkit-scrollbar) {
		width: 6px;
	}

	:global(*::-webkit-scrollbar-track) {
		background: rgba(255, 255, 255, 0.05);
	}

	:global(*::-webkit-scrollbar-thumb) {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 10px;
	}

	:global(*::-webkit-scrollbar-thumb:hover) {
		background: rgba(255, 255, 255, 0.3);
	}
</style>

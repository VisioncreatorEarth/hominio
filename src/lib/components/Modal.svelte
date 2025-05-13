<script lang="ts">
	import { modalStore, closeModal } from '$lib/wallet/modalStore';
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// No props needed, it reads directly from the store
</script>

{#if $modalStore.isOpen && $modalStore.component}
	<!-- Backdrop -->
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		on:click={() => {
			if ($modalStore.props && typeof $modalStore.props.onCancel === 'function') {
				$modalStore.props.onCancel();
			}
			closeModal();
		}}
		role="presentation"
	></div>

	<!-- Modal Content -->
	<div
		transition:fade={{ duration: 200, delay: 50, easing: quintOut }}
		class="fixed bottom-20 left-1/2 z-50 w-full max-w-6xl -translate-x-1/2 rounded-lg shadow-xl"
		on:click|stopPropagation
		role="dialog"
		aria-modal="true"
	>
		<!-- Close Button -->
		<button
			on:click={() => {
				if ($modalStore.props && typeof $modalStore.props.onCancel === 'function') {
					$modalStore.props.onCancel();
				}
				closeModal();
			}}
			class="absolute top-2 right-2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:ring-2 focus:ring-gray-400 focus:outline-none"
			aria-label="Close modal"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg
			>
		</button>

		<!-- Dynamic Component Rendering -->
		<svelte:component this={$modalStore.component} {...$modalStore.props} />
	</div>
{/if}

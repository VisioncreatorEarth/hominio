<script lang="ts">
	let { message = 'Earth' } = $props<{ message?: string }>();
</script>

<div class="rounded bg-gradient-to-br from-green-100 to-blue-100 p-4">
	<h2 class="text-center text-lg font-semibold text-green-800">Hello {message}!</h2>
	<p class="mt-2 text-center text-sm text-blue-700">
		This component is rendered inside the generic modal.
	</p>
</div>

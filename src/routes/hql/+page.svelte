<script lang="ts">
	import { onMount } from 'svelte';
	import { hqlStore } from '$lib/KERNEL/hql-service/hqlService';
	import type {
		HQLDocument,
		SchemaDefinition,
		Entity,
		SupportedLanguage
	} from '$lib/KERNEL/hql-service/types';

	// Language selection
	const languages = [
		{ id: 'loj', name: 'Lojban' },
		{ id: 'en', name: 'English' },
		{ id: 'de', name: 'Deutsch' }
	];

	// Local state to avoid direct store dependencies
	let allDocuments = [];
	let currentDocument = null;
	let currentLanguage = 'loj';
	let availableSchemaTypes = [];
	let groupedDocuments = { schemas: [], entities: [], hasMultipleTypes: false };

	// Filter by schema type
	let selectedSchemaType = 'all';

	// Subscribe to store changes
	onMount(() => {
		// Setup subscriptions
		const docsUnsub = hqlStore.documents.subscribe((value) => {
			allDocuments = value || [];

			// Extract available schema types from documents
			if (allDocuments.length > 0) {
				const schemaTypes = new Set();
				schemaTypes.add('all');

				// First add gismu as it's the fundamental meta-schema
				const gismuDoc = allDocuments.find(
					(doc) => doc.type === 'schema' && doc.document.name === 'gismu'
				);
				if (gismuDoc) {
					schemaTypes.add('gismu');
				}

				// Then add all other schema types
				allDocuments.forEach((doc) => {
					if (doc.type === 'schema' && doc.document.name !== 'gismu') {
						schemaTypes.add(doc.document.name);
					}
				});

				availableSchemaTypes = Array.from(schemaTypes).map((type) => {
					if (type === 'all') {
						return {
							id: 'all',
							name:
								currentLanguage === 'loj'
									? 'roda docki'
									: currentLanguage === 'de'
										? 'Alle Dokumente'
										: 'All Documents'
						};
					}

					if (type === 'gismu') {
						return {
							id: 'gismu',
							name:
								currentLanguage === 'loj'
									? 'gismu'
									: currentLanguage === 'de'
										? 'Stammwörter'
										: 'Root Words'
						};
					}

					// Find the schema for translation
					const schema = allDocuments.find(
						(doc) => doc.type === 'schema' && doc.document.name === type
					)?.document;

					if (schema && schema.translations) {
						const translation = schema.translations.find((t) => t.lang === currentLanguage);
						if (translation) {
							return { id: type, name: translation.name || type };
						}
					}

					return { id: type, name: type };
				});
			}
		});

		const docUnsub = hqlStore.selectedDocument.subscribe((value) => {
			currentDocument = value;
		});

		const langUnsub = hqlStore.selectedLanguage.subscribe((value) => {
			currentLanguage = value;
		});

		// Select first document when documents are loaded
		if (allDocuments.length > 0) {
			selectDocument(allDocuments[0].pubkey);
		}

		// Cleanup subscriptions
		return () => {
			docsUnsub();
			docUnsub();
			langUnsub();
		};
	});

	// Update the schema type names when language changes
	$: {
		if (allDocuments.length > 0 && currentLanguage) {
			// Find the gismu schema for proper typing
			const gismuSchema = allDocuments.find(
				(doc) => doc.type === 'schema' && doc.document.name === 'gismu'
			)?.document;

			availableSchemaTypes = availableSchemaTypes.map((type) => {
				if (type.id === 'all') {
					return {
						id: 'all',
						name:
							currentLanguage === 'loj'
								? 'roda docki'
								: currentLanguage === 'de'
									? 'Alle Dokumente'
									: 'All Documents'
					};
				}

				// Find the schema for translation
				const schema = allDocuments.find(
					(doc) => doc.type === 'schema' && doc.document.name === type.id
				)?.document;

				if (schema && schema.translations) {
					const translation = schema.translations.find((t) => t.lang === currentLanguage);
					if (translation) {
						return { id: type.id, name: translation.name || type.id };
					}
				}

				return type;
			});
		}
	}

	// Extract and group schema types based on their relationships
	$: {
		if (allDocuments.length > 0) {
			// First identify the gismu schema
			const gismuSchema = allDocuments.find(
				(doc) => doc.type === 'schema' && doc.document.name === 'gismu'
			)?.document;

			if (gismuSchema) {
				// Get all schema definitions and group by whether they reference gismu
				const schemasByGismu = allDocuments
					.filter((doc) => doc.type === 'schema')
					.reduce((acc, doc) => {
						if (doc.document.schema === gismuSchema.pubkey) {
							// This is a direct gismu schema (like prenu, gunka, etc.)
							if (!acc.gismuSchemas) acc.gismuSchemas = [];
							acc.gismuSchemas.push(doc);
						} else {
							// This is some other schema type
							if (!acc.otherSchemas) acc.otherSchemas = [];
							acc.otherSchemas.push(doc);
						}
						return acc;
					}, {});
			}
		}
	}

	// Filtered documents based on selected schema type
	$: filteredDocuments =
		selectedSchemaType === 'all'
			? allDocuments
			: selectedSchemaType === 'gismu'
				? filterGismuDocuments()
				: filterRegularSchemaDocuments();

	// Group filtered documents by type for sidebar display
	$: {
		if (filteredDocuments.length > 0) {
			// Split documents into schemas and entities
			const schemas = filteredDocuments.filter((doc) => doc.type === 'schema');
			const entities = filteredDocuments.filter((doc) => doc.type === 'entity');

			// Store for use in the template
			groupedDocuments = {
				schemas,
				entities,
				hasMultipleTypes: schemas.length > 0 && entities.length > 0
			};
		} else {
			groupedDocuments = {
				schemas: [],
				entities: [],
				hasMultipleTypes: false
			};
		}
	}

	// Function to filter documents for the gismu (meta-schema) view
	function filterGismuDocuments() {
		// For gismu, show the gismu schema itself and all schemas referencing it
		return allDocuments.filter((doc) => {
			if (doc.type === 'schema') {
				if (doc.document.name === 'gismu') {
					return true; // The gismu schema itself
				}

				// Get the gismu schema
				const gismuDoc = allDocuments.find(
					(d) => d.type === 'schema' && d.document.name === 'gismu'
				);

				if (gismuDoc && doc.document.schema === gismuDoc.pubkey) {
					return true; // Schemas that directly reference gismu
				}
			}
			return false;
		});
	}

	// Function to filter documents for regular schema types
	function filterRegularSchemaDocuments() {
		return allDocuments.filter((doc) => {
			if (doc.type === 'schema') {
				// Only include the schema itself
				return doc.document.name === selectedSchemaType;
			} else if (doc.type === 'entity') {
				// Only include entities that directly use this schema
				const schema = hqlStore.getSchemaById(doc.document.schema);
				return schema && schema.name === selectedSchemaType;
			}
			return false;
		});
	}

	// Get the document's schema name - improved to handle schema relationships
	function getDocumentSchemaName(doc: HQLDocument): string {
		if (!doc) return '';

		if (doc.type === 'schema') {
			// Special case for schemas that reference gismu
			const gismuSchema = allDocuments.find(
				(d) => d.type === 'schema' && d.document.name === 'gismu'
			)?.document;

			// If this schema is a direct child of gismu, display it as a ROOT WORD/GISMU
			if (
				gismuSchema &&
				doc.document.schema === gismuSchema.pubkey &&
				doc.document.name !== 'gismu'
			) {
				// Return the translation for "Root Word" in the current language
				if (currentLanguage === 'loj') {
					return 'gismu';
				}

				const gismuName = currentLanguage === 'de' ? 'Stammwort' : 'Root Word';
				return gismuName;
			}

			// For schema documents, use translation or name
			if (currentLanguage === 'loj') {
				return doc.document.name;
			}

			const translation = doc.document.translations?.find((t) => t.lang === currentLanguage);
			return translation?.name || doc.document.name;
		} else if (doc.type === 'entity') {
			// For entity documents, get schema name from referenced schema
			const schema = hqlStore.getSchemaById(doc.document.schema);
			if (schema) {
				if (currentLanguage === 'loj') {
					return schema.name;
				}

				const translation = schema.translations?.find((t) => t.lang === currentLanguage);
				return translation?.name || schema.name;
			}
		}
		return 'Unknown';
	}

	// Function to get a translated name
	function getTranslatedName(doc: HQLDocument): string {
		if (!doc) return '';

		if (doc.type === 'schema') {
			const schema = doc.document;

			if (currentLanguage === 'loj') {
				return schema.name;
			}

			const translation = schema.translations?.find((t) => t.lang === currentLanguage);
			return translation?.name || schema.name || '';
		} else {
			return (doc.document as Entity).name || getDocumentSchemaName(doc);
		}
	}

	// Function to get a place translation
	function getPlaceTranslation(schema: SchemaDefinition, placeKey: string): string {
		if (!schema || !schema.places || !schema.places[placeKey]) return '';

		if (currentLanguage === 'loj') {
			return schema.places[placeKey].description;
		}

		const translation = schema.translations?.find((t) => t.lang === currentLanguage);
		if (translation?.places && translation.places[placeKey]) {
			return translation.places[placeKey];
		}
		return schema.places[placeKey]?.description || '';
	}

	// Function to resolve entity references
	function getEntityName(pubkey: string): string {
		if (!pubkey) return '';

		const entity = hqlStore.getEntityById(pubkey);
		return entity?.name || pubkey;
	}

	// Function to format pubkey for display
	function formatPubkey(pubkey: string): string {
		if (!pubkey) return '';
		return pubkey.startsWith('@') ? pubkey : `@${pubkey}`;
	}

	// Function to get a readable display name for an entity reference
	function getEntityDisplayName(pubkey: string): string {
		if (!pubkey) return '';

		const entity = hqlStore.getEntityById(pubkey);
		if (entity && entity.name) {
			return entity.name;
		}

		// If no name, return shortened pubkey
		return formatPubkey(pubkey.substring(0, 8) + '...');
	}

	// Function to get allowed schema names for entity references
	function getAllowedSchemaNames(place: any): string {
		if (!place || !place.entitySchemas || !place.entitySchemas.length) {
			return 'Any';
		}

		return place.entitySchemas
			.map((schemaId) => {
				const schema = hqlStore.getSchemaById(schemaId);
				if (schema) {
					const translation = schema.translations?.find((t) => t.lang === currentLanguage);
					return translation?.name || schema.name;
				}
				return schemaId;
			})
			.join(', ');
	}

	// Function to select a document
	function selectDocument(pubkey: string) {
		if (pubkey) {
			hqlStore.selectDocument(pubkey);
		}
	}

	// Set the language
	function setLanguage(langId: string) {
		if (langId) {
			hqlStore.selectLanguage(langId);
		}
	}
</script>

<div class="glass-container">
	<div class="glass-header">
		<h1>Hominio Query Language (HQL)</h1>
		<div class="controls">
			<div class="glass-select">
				<label for="language">Language:</label>
				<select
					id="language"
					bind:value={currentLanguage}
					on:change={(e) => setLanguage(e.currentTarget.value)}
				>
					{#each languages as lang}
						<option value={lang.id}>{lang.name}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="main-content">
		<div class="glass-sidebar">
			<h2>Documents</h2>

			<div class="sidebar-filter">
				<label for="schemaType">
					{currentLanguage === 'loj'
						? 'klesi'
						: currentLanguage === 'de'
							? 'Schema-Typ'
							: 'Schema Type'}:
				</label>
				<select id="schemaType" bind:value={selectedSchemaType}>
					{#each availableSchemaTypes as schemaType}
						<option value={schemaType.id}>{schemaType.name}</option>
					{/each}
				</select>
			</div>

			<ul class="document-list">
				{#if groupedDocuments.schemas.length > 0}
					{#each groupedDocuments.schemas as doc}
						<li
							class={currentDocument?.pubkey === doc.pubkey ? 'selected' : ''}
							on:click={() => selectDocument(doc.pubkey)}
						>
							<span class="doc-type">{getDocumentSchemaName(doc)}</span>
							<span class="doc-name">{getTranslatedName(doc)}</span>
						</li>
					{/each}
				{/if}

				{#if groupedDocuments.hasMultipleTypes}
					<li class="space-divider"></li>
				{/if}

				{#if groupedDocuments.entities.length > 0}
					{#each groupedDocuments.entities as doc}
						<li
							class={currentDocument?.pubkey === doc.pubkey ? 'selected' : ''}
							on:click={() => selectDocument(doc.pubkey)}
						>
							<span class="doc-type">{getDocumentSchemaName(doc)}</span>
							<span class="doc-name">{getTranslatedName(doc)}</span>
						</li>
					{/each}
				{/if}
			</ul>
		</div>

		<div class="glass-content">
			{#if currentDocument}
				<div class="document-header">
					<h2>{getTranslatedName(currentDocument)}</h2>
					<div class="document-meta">
						<span class="pubkey">ID: {formatPubkey(currentDocument.pubkey)}</span>
						<span class="type">Type: {getDocumentSchemaName(currentDocument)}</span>
						{#if currentDocument.type === 'entity'}
							<span class="schema">Schema: {formatPubkey(currentDocument.document.schema)}</span>
						{/if}
					</div>
				</div>

				<div class="document-content">
					{#if currentDocument.type === 'schema'}
						{@const schema = currentDocument.document}
						<div class="schema-details">
							<h3>Places</h3>
							<div class="places-grid">
								{#each Object.entries(schema.places || {}) as [placeKey, place]}
									<div class="glass-card">
										<div class="place-header">
											<strong>{placeKey}</strong>
											{#if place.required}<span class="required">*</span>{/if}
										</div>
										<div class="place-desc">{getPlaceTranslation(schema, placeKey)}</div>
										<div class="place-meta">
											<div class="place-type">
												Type: {Array.isArray(place.type) ? place.type.join(' | ') : place.type}
											</div>
											{#if place.type === 'entity' || (Array.isArray(place.type) && place.type.includes('entity'))}
												<div class="allowed-schemas">
													Allowed schemas: {getAllowedSchemaNames(place)}
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else if currentDocument.type === 'entity'}
						{@const entity = currentDocument.document}
						{@const schema = hqlStore.getSchemaById(entity.schema)}
						{#if schema}
							<div class="entity-details">
								<h3>Places</h3>
								<div class="places-grid">
									{#each Object.entries(entity.places || {}) as [placeKey, value]}
										<div class="glass-card">
											<div class="place-header">
												<strong>{placeKey}</strong>
											</div>
											<div class="place-desc">
												{#if schema.places && schema.places[placeKey]}
													{getPlaceTranslation(schema, placeKey)}
												{:else}
													Unknown place
												{/if}
											</div>
											<div class="place-value">
												{#if value && typeof value === 'string' && value.includes('0x')}
													<a href="#{value}" on:click|preventDefault={() => selectDocument(value)}>
														{getEntityDisplayName(value)}
													</a>
												{:else}
													{value === null ? 'null' : value}
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="error">Could not find schema for this document.</div>
						{/if}
					{/if}
				</div>
			{:else}
				<div class="no-selection">Select a document from the sidebar to view its details</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		color: #fff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		height: 100vh;
		overflow: hidden;
	}

	/* Fallback background gradient if no image is found */
	:global(body)::before {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, rgba(20, 30, 48, 0.9), rgba(36, 59, 85, 0.8));
		z-index: -1;
	}

	/* Glassmorphism container */
	.glass-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		background-color: rgba(24, 39, 75, 0.35);
	}

	/* Header with glassmorphism */
	.glass-header {
		padding: 1.25rem 2rem;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		background-color: rgba(27, 38, 73, 0.55);
		border-bottom: 1px solid rgba(255, 255, 255, 0.18);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		display: flex;
		justify-content: space-between;
		align-items: center;
		z-index: 10;
	}

	.glass-header h1 {
		margin: 0;
		font-size: 1.6rem;
		color: rgba(255, 255, 255, 0.95);
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	/* Controls section */
	.controls {
		display: flex;
		gap: 1.5rem;
		align-items: center;
	}

	/* Glassmorphism select boxes */
	.glass-select {
		display: flex;
		align-items: center;
		background-color: rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 0.5rem 1rem;
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.glass-select label {
		margin-right: 0.75rem;
		color: rgba(255, 255, 255, 0.9);
		font-weight: 500;
	}

	.glass-select select {
		background-color: rgba(255, 255, 255, 0.15);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 6px;
		padding: 0.35rem 0.75rem;
		font-size: 0.9rem;
		outline: none;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.glass-select select:hover {
		background-color: rgba(255, 255, 255, 0.22);
	}

	.glass-select select:focus {
		box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.5);
	}

	/* Main content area */
	.main-content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Sidebar with glassmorphism */
	.glass-sidebar {
		width: 300px;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		background-color: rgba(25, 35, 60, 0.45);
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
	}

	.glass-sidebar h2 {
		color: rgba(255, 255, 255, 0.92);
		margin-top: 0;
		margin-bottom: 1.25rem;
		font-size: 1.3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.15);
		padding-bottom: 0.75rem;
	}

	/* Document list */
	.document-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.document-list li {
		padding: 0.85rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		background-color: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
	}

	.document-list li:hover {
		background-color: rgba(255, 255, 255, 0.14);
		transform: translateY(-2px);
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
	}

	.document-list li.selected {
		background-color: rgba(99, 179, 237, 0.25);
		border-color: rgba(99, 179, 237, 0.5);
		box-shadow: 0 4px 12px rgba(21, 101, 192, 0.25);
	}

	.doc-type {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.35rem;
	}

	.doc-name {
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.92);
		font-weight: 500;
	}

	.doc-id {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 0.35rem;
		font-family: monospace;
	}

	/* Main content area with glassmorphism */
	.glass-content {
		flex: 1;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		background-color: rgba(33, 43, 70, 0.4);
		padding: 1.75rem;
		overflow-y: auto;
	}

	/* Document header */
	.document-header {
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.15);
	}

	.document-header h2 {
		margin-top: 0;
		margin-bottom: 0.5rem;
		color: rgba(255, 255, 255, 0.95);
		font-size: 1.6rem;
	}

	.document-meta {
		display: flex;
		gap: 1.25rem;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.9rem;
	}

	/* Places grid */
	.places-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
		margin-top: 1rem;
	}

	/* Glass cards for places */
	.glass-card {
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		padding: 1.25rem;
		transition: all 0.25s ease;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
	}

	.glass-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
		background-color: rgba(255, 255, 255, 0.15);
	}

	.place-header {
		margin-bottom: 0.75rem;
		font-size: 1.1rem;
		color: rgba(255, 255, 255, 0.95);
		display: flex;
		align-items: center;
	}

	.place-desc {
		margin-bottom: 0.75rem;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.4;
	}

	.place-meta {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.place-type,
	.place-value {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.7);
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.allowed-schemas {
		color: #63b3ed;
		font-style: italic;
	}

	.ref-schema {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.85rem;
		margin-left: 0.25rem;
	}

	.required {
		color: #ff6b6b;
		margin-left: 0.35rem;
		font-weight: bold;
	}

	.no-selection {
		display: flex;
		height: 100%;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.1rem;
		font-style: italic;
	}

	.error {
		color: #ff6b6b;
		padding: 1.25rem;
		border: 1px solid rgba(255, 99, 99, 0.3);
		border-radius: 8px;
		background-color: rgba(255, 99, 99, 0.1);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	/* Links */
	a {
		color: #63b3ed;
		text-decoration: none;
		transition: all 0.2s ease;
	}

	a:hover {
		color: #90cdf4;
		text-decoration: underline;
	}

	/* Schema/entity details */
	.schema-details h3,
	.entity-details h3 {
		color: rgba(255, 255, 255, 0.9);
		margin-top: 0.5rem;
		margin-bottom: 1.25rem;
		font-size: 1.3rem;
	}

	/* Scrollbar styling */
	::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	/* Media queries for responsiveness */
	@media (max-width: 768px) {
		.main-content {
			flex-direction: column;
		}

		.glass-sidebar {
			width: 100%;
			max-height: 300px;
		}

		.glass-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.controls {
			width: 100%;
			justify-content: space-between;
		}
	}

	.space-divider {
		height: 1rem;
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		cursor: default !important;
		padding: 0;
		transform: none !important;
		pointer-events: none;
	}

	.space-divider:hover {
		background: none !important;
		transform: none !important;
		box-shadow: none !important;
	}

	.sidebar-filter {
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		background-color: rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.75rem;
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	.sidebar-filter label {
		margin-bottom: 0.5rem;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.sidebar-filter select {
		background-color: rgba(255, 255, 255, 0.15);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 6px;
		padding: 0.5rem;
		font-size: 0.9rem;
		width: 100%;
		outline: none;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.sidebar-filter select:hover {
		background-color: rgba(255, 255, 255, 0.22);
	}

	.sidebar-filter select:focus {
		box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.5);
	}
</style>

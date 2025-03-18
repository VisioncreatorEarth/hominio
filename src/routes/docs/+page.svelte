<script lang="ts">
	import { onMount } from 'svelte';
	import { LoroDoc } from 'loro-crdt';
	import { hominio } from '$lib/client/hominio';

	// Define document type
	interface Document {
		doc_id: string;
		label: string;
		name?: string; // Keep for backward compatibility
		doc_type: string;
		binary_data?: any;
		last_updated: string;
		schema?: string;
		latest_snapshot_id?: string;
		is_snapshot?: boolean; // Flag to indicate if this is a snapshot or mutable document
	}

	// State variables
	let documents: Document[] = [];
	let documentsBySchema: Record<string, Document[]> = {};
	let schemaTypes: string[] = [];
	let selectedDoc = $state<Document | null>(null);
	let selectedDocContent = $state<any | null>(null);
	let loading = $state<boolean>(true);
	let error = $state<string | null>(null);
	let viewingSnapshot = $state<boolean>(false); // Track if we're viewing a snapshot or mutable document
	let documentSnapshots = $state<{ id: string; created_at: string }[]>([]);
	let loadingSnapshots = $state<boolean>(false);
	let loroMetadata = $state<{
		stateVersion: any;
		oplogVersion: any;
		stateFrontiers: any;
		oplogFrontiers: any;
		peerId: any;
		docState: any;
	} | null>(null);

	// Fetch all documents from the API
	async function fetchDocuments() {
		try {
			loading = true;
			error = null;

			// Use the resources/docs endpoint
			const response = await hominio.agent.resources.docs.get();

			// Check the data structure
			if (response.data && response.data.status === 'success') {
				// Get all documents
				documents = response.data.documents || [];

				// Reset groups
				documentsBySchema = {};
				schemaTypes = [];

				// Process docs to extract schema information first
				for (const doc of documents) {
					if (doc.binary_data) {
						try {
							// Create schema lookup based on binary data
							const binaryArray = processDocBinary(doc.binary_data);
							if (binaryArray && binaryArray.length > 0 && binaryArray[0] === 123) {
								// JSON document
								const jsonString = new TextDecoder().decode(binaryArray);
								const jsonData = JSON.parse(jsonString);
								if (jsonData?.meta?.['@schema']) {
									doc.schema = jsonData.meta['@schema'];
								}
							}
						} catch (e) {
							console.error(`Error extracting schema for doc ${doc.name}:`, e);
						}
					}
				}

				// Group documents by their schema type
				for (const doc of documents) {
					const schemaType = doc.schema || 'Unknown';

					// Initialize array for this schema if it doesn't exist
					if (!documentsBySchema[schemaType]) {
						documentsBySchema[schemaType] = [];
						schemaTypes.push(schemaType);
					}

					// Add document to its schema group
					documentsBySchema[schemaType].push(doc);
				}

				// Sort schema types to ensure consistent order
				schemaTypes.sort((a, b) => {
					// Put Schema documents first
					if (a.includes('Schema')) return -1;
					if (b.includes('Schema')) return 1;
					// Then sort alphabetically
					return a.localeCompare(b);
				});

				// Sort documents within each group by label
				for (const schemaType of schemaTypes) {
					documentsBySchema[schemaType].sort((a, b) => {
						const labelA = a.label || a.name || '';
						const labelB = b.label || b.name || '';
						return labelA.localeCompare(labelB);
					});
				}

				// Set initial selection to the first schema if available
				if (documents.length > 0 && !selectedDoc) {
					// Prefer schema documents for initial selection
					const schemaGroup = documentsBySchema[schemaTypes[0]] || [];
					if (schemaGroup.length > 0) {
						selectDocument(schemaGroup[0]);
					} else {
						selectDocument(documents[0]);
					}
				}
			} else {
				error = 'Failed to fetch documents';
				console.error('Failed response:', response);
			}
		} catch (e) {
			console.error('Error fetching documents:', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Helper function to process binary data
	function processDocBinary(binaryData: any): Uint8Array | null {
		try {
			// If it's a Buffer-like object with data property
			if (binaryData && binaryData.data && Array.isArray(binaryData.data)) {
				return new Uint8Array(binaryData.data);
			}
			// If it's a Buffer or ArrayBuffer
			else if (
				binaryData &&
				(binaryData.buffer instanceof ArrayBuffer || binaryData instanceof ArrayBuffer)
			) {
				return new Uint8Array(binaryData);
			}
			// If it's an object with numeric properties (like PostgreSQL bytea)
			else if (binaryData && typeof binaryData === 'object') {
				return new Uint8Array(Object.values(binaryData));
			}
			// If it's already a Uint8Array
			else if (binaryData instanceof Uint8Array) {
				return binaryData;
			}
			// If it's a base64 string
			else if (typeof binaryData === 'string') {
				try {
					const binaryString = atob(binaryData);
					const result = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						result[i] = binaryString.charCodeAt(i);
					}
					return result;
				} catch (e) {
					// Not valid base64, try other formats
					// Additional handling omitted for brevity
				}
			}
		} catch (error) {
			console.error('Error processing binary data:', error);
		}
		return null;
	}

	// Select a document and parse its content
	async function selectDocument(doc: Document) {
		try {
			loading = true;
			error = null;
			selectedDoc = doc;
			selectedDocContent = null;
			viewingSnapshot = doc.is_snapshot || false;
			loroMetadata = null;

			// Fetch document snapshots
			fetchDocumentSnapshots(doc.doc_id);

			if (doc.binary_data) {
				try {
					const loroDoc = new LoroDoc();
					const binaryArray = processDocBinary(doc.binary_data);

					if (binaryArray) {
						if (binaryArray.length > 0 && binaryArray[0] === 123) {
							// Process JSON document
							try {
								// Convert Uint8Array to string
								const jsonString = new TextDecoder().decode(binaryArray);
								// Parse the JSON
								const jsonData = JSON.parse(jsonString);

								// Create a new LoroDoc from the JSON data
								const newLoroDoc = new LoroDoc();

								// Add metadata
								const meta = newLoroDoc.getMap('meta');
								if (jsonData.meta) {
									Object.entries(jsonData.meta).forEach(([key, value]) => {
										meta.set(key, value);
									});

									// Check for schema in metadata
									if (jsonData.meta['@schema']) {
										selectedDoc.schema = jsonData.meta['@schema'];
									}

									// Check for latest_snapshot in metadata
									if (jsonData.meta['latest_snapshot']) {
										selectedDoc.latest_snapshot_id = jsonData.meta['latest_snapshot'];
									}

									// Set label from metadata if available
									if (jsonData.meta['label']) {
										selectedDoc.label = jsonData.meta['label'];
									} else if (jsonData.meta['name']) {
										selectedDoc.label = jsonData.meta['name'];
									}
								} else if (jsonData.version) {
									// If it's a direct JSON format without meta
									meta.set('type', doc.doc_type);
									meta.set('label', doc.label || doc.name);
									meta.set('createdAt', Date.now());
								}

								// Add documents if present
								if (jsonData.documents) {
									const documents = newLoroDoc.getMap('documents');
									Object.entries(jsonData.documents).forEach(([key, value]) => {
										documents.set(key, value);
									});
								}

								// Get the document content using toJSON()
								selectedDocContent = newLoroDoc.toJSON();
							} catch (jsonError) {
								console.error('Error parsing JSON document:', jsonError);
								error = `Error parsing JSON document: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`;
							}
						} else {
							// Process Loro binary format
							try {
								loroDoc.import(binaryArray);
								selectedDocContent = loroDoc.toJSON();

								// Extract Loro CRDT metadata
								const stateVer = loroDoc.version();
								const oplogVer = loroDoc.oplogVersion();
								console.log('Debug - State Version:', stateVer);
								console.log('Debug - OpLog Version:', oplogVer);

								loroMetadata = {
									stateVersion: stateVer,
									oplogVersion: oplogVer,
									stateFrontiers: loroDoc.frontiers(),
									oplogFrontiers: loroDoc.oplogFrontiers(),
									peerId: loroDoc.peerId,
									docState: loroDoc.toJSON()
								};
							} catch (loroError) {
								console.error('Error importing Loro document:', loroError);
								error = `Error importing Loro document: ${loroError instanceof Error ? loroError.message : String(loroError)}`;
							}
						}
					} else {
						error = 'Could not process binary data';
					}
				} catch (docError) {
					console.error('Error creating LoroDoc:', docError);
					error = `Error creating document: ${docError instanceof Error ? docError.message : String(docError)}`;
				}
			} else {
				// If binary data is not included in the document list, fetch it
				try {
					const response = await hominio.agent.resources.docs.snapshots[doc.doc_id].latest.get();

					if (response.data && response.data.status === 'success' && response.data.binary_data) {
						try {
							// Create a new LoroDoc instance
							const loroDoc = new LoroDoc();

							// Process the binary data - ensure it's a Uint8Array
							let binaryArray: Uint8Array;

							try {
								// If it's a Buffer-like object with data property
								if (
									response.data.binary_data &&
									response.data.binary_data.data &&
									Array.isArray(response.data.binary_data.data)
								) {
									binaryArray = new Uint8Array(response.data.binary_data.data);
								}
								// If it's a Buffer or ArrayBuffer
								else if (
									response.data.binary_data &&
									(response.data.binary_data.buffer instanceof ArrayBuffer ||
										response.data.binary_data instanceof ArrayBuffer)
								) {
									binaryArray = new Uint8Array(response.data.binary_data);
								}
								// If it's an object with numeric properties (like PostgreSQL bytea)
								else if (
									response.data.binary_data &&
									typeof response.data.binary_data === 'object'
								) {
									binaryArray = new Uint8Array(Object.values(response.data.binary_data));
								}
								// If it's already a Uint8Array
								else if (response.data.binary_data instanceof Uint8Array) {
									binaryArray = response.data.binary_data;
								}
								// If it's a base64 string
								else if (typeof response.data.binary_data === 'string') {
									try {
										const binaryString = atob(response.data.binary_data);
										binaryArray = new Uint8Array(binaryString.length);
										for (let i = 0; i < binaryString.length; i++) {
											binaryArray[i] = binaryString.charCodeAt(i);
										}
									} catch (e) {
										// If it's not a valid base64 string, try parsing it as JSON
										try {
											const jsonData = JSON.parse(response.data.binary_data);
											if (jsonData && typeof jsonData === 'object') {
												// If it's a JSON object with data property
												if (jsonData.data && Array.isArray(jsonData.data)) {
													binaryArray = new Uint8Array(jsonData.data);
												} else {
													// Try to convert the JSON object to a Uint8Array
													binaryArray = new Uint8Array(
														Object.values(jsonData).filter((v) => typeof v === 'number')
													);
												}
											} else {
												throw new Error('Invalid JSON data format');
											}
										} catch (jsonError) {
											console.error('Failed to parse as JSON:', jsonError);
											// Try one more approach - if it's a comma-separated string of numbers
											if (response.data.binary_data.includes(',')) {
												try {
													const numbers = response.data.binary_data.split(',').map(Number);
													if (numbers.every((n: number) => !isNaN(n))) {
														binaryArray = new Uint8Array(numbers);
													} else {
														throw new Error('Invalid number format in comma-separated string');
													}
												} catch (csvError) {
													console.error('Failed to parse as comma-separated values:', csvError);
													throw new Error('Invalid binary data format: not base64, JSON, or CSV');
												}
											} else {
												throw new Error('Invalid binary data format: not base64 or JSON');
											}
										}
									}
								} else {
									throw new Error('Unsupported binary data format');
								}

								console.log('Fetched binary data info:', {
									type: typeof response.data.binary_data,
									isArray: Array.isArray(response.data.binary_data),
									length: binaryArray.length,
									firstBytes: Array.from(binaryArray.slice(0, 20)),
									keys:
										typeof response.data.binary_data === 'object'
											? Object.keys(response.data.binary_data)
											: null
								});

								// Check if this is a JSON document (starts with "{")
								if (binaryArray.length > 0 && binaryArray[0] === 123) {
									// ASCII for "{"
									// This is a JSON document, not a Loro binary format
									try {
										// Convert Uint8Array to string
										const jsonString = new TextDecoder().decode(binaryArray);
										// Parse the JSON
										const jsonData = JSON.parse(jsonString);

										// Create a new LoroDoc from the JSON data
										const newLoroDoc = new LoroDoc();

										// Add metadata
										const meta = newLoroDoc.getMap('meta');
										if (jsonData.meta) {
											Object.entries(jsonData.meta).forEach(([key, value]) => {
												meta.set(key, value);
											});
										} else if (jsonData.version) {
											// If it's a direct JSON format without meta
											meta.set('type', doc.doc_type);
											meta.set('name', doc.name);
											meta.set('createdAt', Date.now());
										}

										// Add documents if present
										if (jsonData.documents) {
											const documents = newLoroDoc.getMap('documents');
											Object.entries(jsonData.documents).forEach(([key, value]) => {
												documents.set(key, value);
											});
										}

										// Get the document content using toJSON()
										selectedDocContent = newLoroDoc.toJSON();
									} catch (jsonError) {
										console.error('Error parsing JSON document:', jsonError);
										error = `Error parsing JSON document: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`;
									}
								} else {
									// This is a Loro binary format
									try {
										// Import the binary data - this is synchronous according to Loro docs
										loroDoc.import(binaryArray);
										// Get the document content using toJSON()
										selectedDocContent = loroDoc.toJSON();
									} catch (loroError) {
										console.error('Error importing Loro document:', loroError);
										error = `Error importing Loro document: ${loroError instanceof Error ? loroError.message : String(loroError)}`;
									}
								}
							} catch (conversionError) {
								console.error('Error converting fetched binary data:', conversionError);
								error = `Error converting binary data: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`;
							}
						} catch (docError) {
							console.error('Error creating LoroDoc for fetched data:', docError);
							error = `Error creating document: ${docError instanceof Error ? docError.message : String(docError)}`;
						}
					} else {
						error = 'No binary data found for document';
					}
				} catch (fetchError) {
					console.error('Error fetching document binary data:', fetchError);
					error = `Error fetching document: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
				}
			}
		} catch (e) {
			console.error('Error selecting document:', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Load the latest snapshot of a document
	async function loadLatestSnapshot(docId: string) {
		try {
			loading = true;
			error = null;

			const response = await hominio.agent.resources.docs.snapshots[docId].latest.get();

			if (response.data && response.data.status === 'success' && response.data.binary_data) {
				// Create snapshot document object
				const snapshotDoc: Document = {
					...selectedDoc!,
					doc_id: response.data.snapshot_id || selectedDoc!.doc_id,
					is_snapshot: true
				};

				// Select the snapshot document
				selectedDoc = snapshotDoc;
				viewingSnapshot = true;

				// Process binary data
				// ... (same binary processing logic as in selectDocument)
				const binaryArray = processDocBinary(response.data.binary_data);

				if (binaryArray) {
					// Check if this is a JSON document (starts with "{")
					if (binaryArray.length > 0 && binaryArray[0] === 123) {
						// This is a JSON document, not a Loro binary format
						try {
							const jsonString = new TextDecoder().decode(binaryArray);
							const jsonData = JSON.parse(jsonString);

							// Create a new LoroDoc instance
							const loroDoc = new LoroDoc();

							// Add metadata
							const meta = loroDoc.getMap('meta');
							if (jsonData.meta) {
								Object.entries(jsonData.meta).forEach(([key, value]) => {
									meta.set(key, value);
								});
							}

							// Add other data
							Object.entries(jsonData).forEach(([key, value]) => {
								if (key !== 'meta') {
									const container = loroDoc.getMap(key);
									if (typeof value === 'object' && value !== null) {
										Object.entries(value).forEach(([subKey, subValue]) => {
											container.set(subKey, subValue);
										});
									}
								}
							});

							selectedDocContent = loroDoc.toJSON();
						} catch (jsonError) {
							console.error('Error parsing JSON snapshot:', jsonError);
							error = `Error parsing JSON snapshot: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`;
						}
					} else {
						// This is a Loro binary format
						try {
							const loroDoc = new LoroDoc();
							loroDoc.import(binaryArray);
							selectedDocContent = loroDoc.toJSON();
						} catch (loroError) {
							console.error('Error importing Loro snapshot:', loroError);
							error = `Error importing Loro snapshot: ${loroError instanceof Error ? loroError.message : String(loroError)}`;
						}
					}
				} else {
					error = 'Could not process snapshot binary data';
				}
			} else {
				error = 'No snapshot data found for this document';
			}
		} catch (e) {
			console.error('Error loading snapshot:', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Return to the mutable document view
	function viewMutableDocument() {
		if (selectedDoc && !viewingSnapshot) return;

		// Re-fetch the original document
		const originalDoc = documents.find(
			(d) => d.doc_id === selectedDoc?.doc_id.split('-snapshot-')[0]
		);
		if (originalDoc) {
			selectDocument(originalDoc);
		}
	}

	// Format date for display
	function formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			return date.toLocaleString();
		} catch (e) {
			return dateString;
		}
	}

	// Get document type styling
	function getDocTypeStyle(type: string): { bg: string; text: string; label: string } {
		// If we have a schema, use it as the label
		if (selectedDoc?.schema) {
			return {
				bg: 'bg-blue-900/20',
				text: 'text-blue-200',
				label: selectedDoc.schema
			};
		}

		// Otherwise use the doc_type
		return {
			bg: 'bg-blue-900/20',
			text: 'text-blue-200',
			label: type
		};
	}

	// Fetch snapshots for a document
	async function fetchDocumentSnapshots(docId: string) {
		try {
			loadingSnapshots = true;

			const response = await hominio.agent.resources.docs.snapshots[docId].get();

			if (response.data && response.data.status === 'success') {
				documentSnapshots = response.data.snapshots || [];
			} else {
				console.error('Failed to fetch snapshots:', response);
				documentSnapshots = [];
			}
		} catch (e) {
			console.error('Error fetching snapshots:', e);
			documentSnapshots = [];
		} finally {
			loadingSnapshots = false;
		}
	}

	// Load a specific snapshot
	async function loadSnapshot(snapshotId: string) {
		try {
			loading = true;
			error = null;

			const response = await hominio.agent.resources.docs.snapshots.by_id[snapshotId].get();

			if (response.data && response.data.status === 'success' && response.data.binary_data) {
				// Create snapshot document object
				const snapshotDoc: Document = {
					...selectedDoc!,
					doc_id: snapshotId,
					is_snapshot: true
				};

				// Select the snapshot document
				selectedDoc = snapshotDoc;
				viewingSnapshot = true;

				// Process binary data
				const binaryArray = processDocBinary(response.data.binary_data);

				if (binaryArray) {
					// Check if this is a JSON document (starts with "{")
					if (binaryArray.length > 0 && binaryArray[0] === 123) {
						// Process JSON document
						try {
							const jsonString = new TextDecoder().decode(binaryArray);
							const jsonData = JSON.parse(jsonString);

							// Create a new LoroDoc instance
							const loroDoc = new LoroDoc();

							// Add metadata
							const meta = loroDoc.getMap('meta');
							if (jsonData.meta) {
								Object.entries(jsonData.meta).forEach(([key, value]) => {
									meta.set(key, value);
								});
							}

							// Add other data
							Object.entries(jsonData).forEach(([key, value]) => {
								if (key !== 'meta') {
									const container = loroDoc.getMap(key);
									if (typeof value === 'object' && value !== null) {
										Object.entries(value).forEach(([subKey, subValue]) => {
											container.set(subKey, subValue);
										});
									}
								}
							});

							selectedDocContent = loroDoc.toJSON();
						} catch (jsonError) {
							console.error('Error parsing JSON snapshot:', jsonError);
							error = `Error parsing JSON snapshot: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`;
						}
					} else {
						// Process Loro binary
						try {
							const loroDoc = new LoroDoc();
							loroDoc.import(binaryArray);
							selectedDocContent = loroDoc.toJSON();
						} catch (loroError) {
							console.error('Error importing Loro snapshot:', loroError);
							error = `Error importing Loro snapshot: ${loroError instanceof Error ? loroError.message : String(loroError)}`;
						}
					}
				} else {
					error = 'Could not process snapshot binary data';
				}
			} else {
				error = 'No snapshot data found';
			}
		} catch (e) {
			console.error('Error loading snapshot:', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Initialize on mount
	onMount(() => {
		fetchDocuments();
	});
</script>

<div class="min-h-screen w-full bg-blue-950 text-emerald-100">
	<div class="container mx-auto p-6">
		<!-- Page header -->
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold text-emerald-400">Documents</h1>
			<div class="text-sm text-emerald-200">Hominio Loro Document Explorer</div>
		</div>

		{#if loading && documents.length === 0}
			<div class="flex h-64 items-center justify-center">
				<p class="text-emerald-100/60">Loading documents...</p>
			</div>
		{:else if error && documents.length === 0}
			<div class="rounded-lg border border-red-500/30 bg-red-900/10 p-4">
				<p class="text-red-300">Error: {error}</p>
			</div>
		{:else}
			<div class="flex gap-6">
				<!-- Left sidebar with document categories -->
				<div class="w-72 shrink-0 rounded-lg border border-blue-800/30 bg-blue-950/50 p-3">
					<!-- Document search -->
					<div class="mb-4">
						<div class="relative">
							<input
								type="text"
								placeholder="Search documents..."
								class="w-full rounded-md border border-blue-700/30 bg-blue-900/30 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-100/40 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
							/>
						</div>
					</div>

					<!-- Documents grouped by schemas -->
					<div class="max-h-[calc(100vh-200px)] space-y-4 overflow-y-auto pr-2">
						{#each schemaTypes as schemaType}
							<div>
								<div class="mb-2 flex items-center">
									<h2 class="text-base font-semibold tracking-wider text-blue-300 uppercase">
										{schemaType}
									</h2>
									<div
										class="ml-2 rounded-full bg-blue-900/30 px-2 py-0.5 text-xs text-emerald-100/40"
									>
										{documentsBySchema[schemaType].length}
									</div>
								</div>

								<div class="flex flex-col gap-1.5">
									{#each documentsBySchema[schemaType] as doc (doc.doc_id)}
										<button
											class={`rounded-lg border p-2 text-left transition-all ${
												selectedDoc?.doc_id === doc.doc_id
													? 'border-blue-500 bg-blue-900/50'
													: 'border-blue-700/10 bg-blue-900/5 hover:bg-blue-900/20'
											}`}
											on:click={() => selectDocument(doc)}
										>
											<div class="truncate text-sm font-medium text-blue-200">
												{doc.label || doc.name}
											</div>
											<div class="mt-1 font-mono text-xs text-blue-100/60">
												{doc.doc_id.substring(0, 8)}...
											</div>
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Main content area -->
				<div class="flex-1 rounded-lg border border-blue-700/30 bg-blue-900/5 p-6">
					<div class="max-h-[calc(100vh-150px)] overflow-y-auto pr-2">
						{#if loading && selectedDoc}
							<div class="flex h-64 items-center justify-center">
								<p class="text-emerald-100/60">Loading document content...</p>
							</div>
						{:else if error && selectedDoc}
							<div class="rounded-lg border border-red-500/30 bg-red-900/10 p-4">
								<p class="text-red-300">Error: {error}</p>
							</div>
						{:else if selectedDoc && selectedDocContent}
							<!-- Simplified Document Header -->
							<div class="mb-6">
								<div class="flex items-center justify-between">
									<h2 class="text-2xl font-bold text-emerald-300">
										{selectedDoc.label || selectedDoc.name}
									</h2>
									{#if selectedDocContent?.meta?.['@schema']}
										<span
											class="rounded-md bg-purple-500/20 px-2 py-1 text-xs font-medium text-purple-200"
										>
											{selectedDocContent.meta['@schema']}
										</span>
									{/if}
								</div>
							</div>

							<!-- Loro CRDT Metadata -->
							<div class="mb-6 rounded-lg border border-blue-700/30 bg-blue-900/10 p-4">
								<h3 class="mb-4 text-lg font-semibold text-emerald-300">Loro CRDT Metadata</h3>
								<div class="space-y-4">
									<!-- Version Information -->
									<div class="rounded-lg border border-blue-700/20 bg-blue-900/20 p-3">
										<h4 class="mb-2 font-medium text-emerald-200">Version Information</h4>
										<div class="space-y-2">
											<div class="flex items-start">
												<div class="w-1/3 text-sm text-emerald-100/60">State Version:</div>
												<div class="w-2/3 font-mono text-sm break-all text-emerald-100">
													{JSON.stringify(loroMetadata?.stateVersion)}
												</div>
											</div>
											<div class="flex items-start">
												<div class="w-1/3 text-sm text-emerald-100/60">OpLog Version:</div>
												<div class="w-2/3 font-mono text-sm break-all text-emerald-100">
													{JSON.stringify(loroMetadata?.oplogVersion)}
												</div>
											</div>
										</div>
									</div>

									<!-- Frontiers -->
									<div class="rounded-lg border border-blue-700/20 bg-blue-900/20 p-3">
										<h4 class="mb-2 font-medium text-emerald-200">Frontiers</h4>
										<div class="space-y-2">
											<div class="flex items-start">
												<div class="w-1/3 text-sm text-emerald-100/60">State Frontiers:</div>
												<div class="w-2/3 font-mono text-sm break-all text-emerald-100">
													{JSON.stringify(loroMetadata?.stateFrontiers)}
												</div>
											</div>
											<div class="flex items-start">
												<div class="w-1/3 text-sm text-emerald-100/60">OpLog Frontiers:</div>
												<div class="w-2/3 font-mono text-sm break-all text-emerald-100">
													{JSON.stringify(loroMetadata?.oplogFrontiers)}
												</div>
											</div>
										</div>
									</div>

									<!-- Peer Information -->
									<div class="rounded-lg border border-blue-700/20 bg-blue-900/20 p-3">
										<h4 class="mb-2 font-medium text-emerald-200">Peer Information</h4>
										<div class="flex items-start">
											<div class="w-1/3 text-sm text-emerald-100/60">Peer ID:</div>
											<div class="w-2/3 font-mono text-sm break-all text-emerald-100">
												{loroMetadata?.peerId}
											</div>
										</div>
									</div>
								</div>
							</div>

							<!-- Document Content -->
							<div class="rounded-lg border border-blue-700/30 bg-blue-900/10 p-4">
								<h3 class="mb-4 text-lg font-semibold text-emerald-300">Document Content</h3>
								<pre
									class="overflow-auto rounded bg-blue-900/20 p-3 font-mono text-sm text-emerald-100">
									{JSON.stringify(selectedDocContent, null, 2)}
								</pre>
							</div>
						{:else if selectedDoc && !selectedDocContent && !loading && !error}
							<div class="rounded-lg border border-yellow-500/30 bg-yellow-900/10 p-4">
								<p class="text-yellow-300">No content available for this document.</p>
							</div>
						{:else}
							<div class="flex h-64 items-center justify-center">
								<p class="text-emerald-100/60">Select a document to view details</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Right sidebar with snapshots -->
				<div class="w-64 shrink-0 rounded-lg border border-blue-800/30 bg-blue-950/50 p-3">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-base font-semibold tracking-wider text-amber-300 uppercase">
							Snapshots
						</h2>

						{#if !loadingSnapshots && documentSnapshots.length > 0}
							<div class="rounded-full bg-blue-900/30 px-2 py-0.5 text-xs text-emerald-100/40">
								{documentSnapshots.length}
							</div>
						{/if}
					</div>

					<div class="max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
						{#if loadingSnapshots}
							<div class="flex h-24 items-center justify-center">
								<p class="text-sm text-emerald-100/60">Loading snapshots...</p>
							</div>
						{:else if documentSnapshots.length === 0}
							<div class="rounded-lg border border-blue-700/20 bg-blue-900/20 p-3">
								<p class="text-center text-sm text-emerald-100/60">No snapshots available</p>
							</div>
						{:else}
							<div class="flex flex-col gap-2">
								<!-- Current/Latest Version -->
								<button
									class={`rounded-lg border p-2 text-left transition-all ${
										!viewingSnapshot
											? 'border-emerald-500 bg-emerald-900/30'
											: 'border-blue-700/10 bg-blue-900/5 hover:bg-blue-900/20'
									}`}
									on:click={viewMutableDocument}
								>
									<div class="flex items-center justify-between">
										<div class="truncate text-sm font-medium text-emerald-200">Current Version</div>
										{#if !viewingSnapshot}
											<div class="h-2 w-2 rounded-full bg-emerald-400"></div>
										{/if}
									</div>
									{#if selectedDocContent?.meta?.['latest_snapshot']}
										<div class="mt-1 truncate font-mono text-xs text-emerald-100/60">
											Points to: {selectedDocContent.meta['latest_snapshot'].substring(0, 8)}...
										</div>
									{/if}
								</button>

								<!-- Snapshot history -->
								{#each documentSnapshots as snapshot (snapshot.id)}
									<button
										class={`rounded-lg border p-2 text-left transition-all ${
											viewingSnapshot && selectedDoc?.doc_id === snapshot.id
												? 'border-amber-500 bg-amber-900/30'
												: 'border-blue-700/10 bg-blue-900/5 hover:bg-blue-900/20'
										}`}
										on:click={() => loadSnapshot(snapshot.id)}
									>
										<div class="flex items-center justify-between">
											<div class="truncate text-sm font-medium text-amber-200">Snapshot</div>
											{#if viewingSnapshot && selectedDoc?.doc_id === snapshot.id}
												<div class="h-2 w-2 rounded-full bg-amber-400"></div>
											{/if}
										</div>
										<div class="mt-1 font-mono text-xs text-amber-100/60">
											{snapshot.id.substring(0, 8)}...
										</div>
										{#if snapshot.created_at}
											<div class="mt-1 text-xs text-amber-100/60">
												{formatDate(snapshot.created_at)}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow-x: hidden;
	}
</style>

<script lang="ts">
	import { executeQuery, type LoroHqlQuery, type QueryResult } from '$lib/NEXT/query';

	let results: QueryResult[] | null = null;
	let isLoading = false;
	let error: string | null = null;
	let currentQueryDefinition: LoroHqlQuery | null = null; // Track displayed query

	// Example Query 1 (Map-Based Syntax): Find tasks assigned to 'Project: Website' (@project1) and their status.
	const exampleQuery1: LoroHqlQuery = {
		from: { sumti_pubkeys: ['@project1'] },
		map: {
			project_name: {
				traverse: {
					bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
					return: 'first',
					map: { _value: { place: 'x2', field: 'self.datni.vasru' } }
				}
			},
			tasks: {
				traverse: {
					bridi_where: { selbri: '@selbri_gunka', place: 'x3' },
					return: 'array',
					map: {
						task_id: { place: 'x2', field: 'self.ckaji.pubkey' },
						task_name: {
							place: 'x2',
							traverse: {
								bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
								return: 'first',
								map: { _value: { place: 'x2', field: 'self.datni.vasru' } }
							}
						},
						worker: {
							place: 'x1', // Target the worker node (at place x1 of gunka)
							map: {
								// Map the worker node itself
								id: { field: 'self.ckaji.pubkey' },
								// Traverse from the worker node to find its linked name
								name: {
									traverse: {
										bridi_where: { selbri: '@selbri_ckaji', place: 'x1' }, // Worker is x1 in ckaji
										return: 'first',
										map: {
											// Map the related name Sumti node (at place x2 of ckaji)
											// Use temporary key, engine extracts value
											_value: { place: 'x2', field: 'self.datni.vasru' }
										}
									}
								}
							}
						}, // End worker object definition
						status: {
							// Nested traversal to find the task's status
							place: 'x2', // Start traversal from the task node (x2 in gunka bridi)
							traverse: {
								bridi_where: { selbri: '@selbri_ckaji', place: 'x1' }, // Task is x1 in ckaji
								return: 'first',
								where_related: [
									{
										place: 'x2',
										field: 'self.ckaji.pubkey',
										condition: {
											in: ['@status_inprogress', '@status_notstarted', '@status_completed']
										}
									}
								],
								map: {
									value: { place: 'x2', field: 'self.datni.vasru' },
									pubkey: { place: 'x2', field: 'self.ckaji.pubkey' }
								}
							}
						} // End status object definition
					} // End map for the main traverse
				} // End traverse object
			} // End tasks definition
		} // End top-level map
	}; // End exampleQuery1 definition

	// Example Query 2: Find people who worked on tasks with skill '@skill_dev'
	const exampleQuery2: LoroHqlQuery = {
		from: { sumti_pubkeys: ['@skill_dev'] }, // Start from the skill Sumti
		map: {
			skill_name: { field: 'self.datni.vasru' },
			tasks_with_skill: {
				traverse: {
					// Find Bridi where @skill_dev is the property (x2 of ckaji)
					bridi_where: { selbri: '@selbri_ckaji', place: 'x2' },
					return: 'array',
					map: {
						// Map the task node (x1 of ckaji)
						task_id: { place: 'x1', field: 'self.ckaji.pubkey' },
						task_name: {
							place: 'x1',
							traverse: {
								bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
								return: 'first',
								map: { _value: { place: 'x2', field: 'self.datni.vasru' } }
							}
						},
						// Nested traverse: Find worker associated with this task
						worker: {
							place: 'x1', // Start from the task node (x1 of ckaji)
							traverse: {
								// Find the gunka relationship for the task
								bridi_where: { selbri: '@selbri_gunka', place: 'x2' }, // Task is x2 in gunka
								return: 'first', // Assume one worker assignment shown
								map: {
									// Map the worker node (x1 of gunka)
									worker_details: {
										// Nest worker details
										place: 'x1', // Target worker node
										map: {
											// Map fields from the worker Sumti
											id: { field: 'self.ckaji.pubkey' },
											// Nested traverse to get worker name
											name: {
												traverse: {
													bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
													return: 'first',
													map: {
														// Get the value from the name Sumti (x2)
														_value: { place: 'x2', field: 'self.datni.vasru' }
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	};

	// Example Query 3: Find tasks Person1 works on, their tags, the project, and the project leader.
	const exampleQuery3: LoroHqlQuery = {
		from: { sumti_pubkeys: ['@person1'] }, // Start from Person 1
		map: {
			person_id: { field: 'self.ckaji.pubkey' },
			person_name: {
				// Get Person 1's name
				traverse: {
					bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
					return: 'first',
					map: {
						_value: { place: 'x2', field: 'self.datni.vasru' } // Extract name value
					}
				}
			},
			work_assignments: {
				// Find gunka relationships where Person 1 is the worker (x1)
				traverse: {
					bridi_where: { selbri: '@selbri_gunka', place: 'x1' },
					return: 'array', // Person might work on multiple tasks/projects
					map: {
						// Map details from the gunka relationship
						task: {
							// Details about the task (x2 in gunka)
							place: 'x2',
							map: {
								// Map fields from the task Sumti
								id: { field: 'self.ckaji.pubkey' },
								name: {
									traverse: {
										bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
										return: 'first',
										map: { _value: { place: 'x2', field: 'self.datni.vasru' } }
									}
								},
								// Nested traverse: Find tags for this task
								tags: {
									traverse: {
										bridi_where: { selbri: '@selbri_ckaji', place: 'x1' }, // Task is x1
										return: 'array',
										where_related: [
											{
												// Filter related node (x2) to be a known tag
												place: 'x2',
												field: 'self.ckaji.pubkey',
												condition: { in: ['@tag_frontend', '@tag_qa'] } // Add more tags if needed
											}
										],
										map: {
											// Extract the tag value itself
											_tag: { place: 'x2', field: 'self.datni.vasru' }
										}
									}
								}
							}
						},
						project: {
							// Details about the project (x3 in gunka)
							place: 'x3',
							map: {
								// Map fields from the project Sumti
								id: { field: 'self.ckaji.pubkey' },
								name: {
									traverse: {
										bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
										return: 'first',
										// Filter: find the ckaji relation where x2 IS a person
										// This implicitly assumes this person is the leader based on initialBridi data structure
										// A more robust way would be to have a specific '@prop_leader' Sumti
										where_related: [
											{
												place: 'x2',
												field: 'self.ckaji.pubkey',
												condition: { in: ['@person1', '@person2', '@person3'] }
											}
										],
										map: {
											// Map the leader node (x2)
											leader_details: {
												place: 'x2', // Target the leader Sumti (x2)
												map: {
													// Map the leader's details
													id: { field: 'self.ckaji.pubkey' },
													// Traverse to get leader's actual name
													name: {
														traverse: {
															bridi_where: { selbri: '@selbri_ckaji', place: 'x1' },
															return: 'first',
															map: {
																_value: { place: 'x2', field: 'self.datni.vasru' }
															}
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	};

	async function runQuery(queryToRun: LoroHqlQuery) {
		isLoading = true;
		error = null;
		results = null;
		currentQueryDefinition = queryToRun; // Store the query being run
		try {
			console.log('Running Query:', JSON.stringify(queryToRun, null, 2));
			const queryResults = await executeQuery(queryToRun);
			console.log('Query Results:', queryResults);
			results = queryResults;
		} catch (err) {
			console.error('Query execution failed:', err);
			error = err instanceof Error ? err.message : 'An unknown error occurred';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="p-6 text-black">
	<h1 class="mb-4 text-2xl font-bold">Loro HQL Test Page</h1>

	<div class="mb-4 flex space-x-4">
		<button
			class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
			on:click={() => runQuery(exampleQuery1)}
			disabled={isLoading}
		>
			{isLoading ? 'Running...' : 'Run Query 1 (Project Tasks)'}
		</button>
		<button
			class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
			on:click={() => runQuery(exampleQuery2)}
			disabled={isLoading}
		>
			{isLoading ? 'Running...' : 'Run Query 2 (Dev Skill Tasks)'}
		</button>
		<button
			class="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
			on:click={() => runQuery(exampleQuery3)}
			disabled={isLoading}
		>
			{isLoading ? 'Running...' : 'Run Query 3 (Person1 Details)'}
		</button>
	</div>

	{#if error}
		<div class="mt-4 rounded border border-red-400 bg-red-100 p-4 text-red-700">
			<strong>Error:</strong>
			{error}
		</div>
	{/if}

	<!-- 50/50 Layout Container -->
	<div class="mt-6 flex w-full space-x-6">
		<!-- Left Side: Query Definition -->
		<div class="w-1/2">
			<h2 class="mb-2 text-xl font-semibold">Query Definition Used:</h2>
			{#if currentQueryDefinition}
				<pre
					class="overflow-x-auto rounded border border-gray-300 bg-gray-100 p-4 text-sm">{JSON.stringify(
						currentQueryDefinition,
						null,
						2
					)}</pre>
			{:else}
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					Click a button to run a query...
				</div>
			{/if}
		</div>

		<!-- Right Side: Query Results -->
		<div class="w-1/2">
			<h2 class="mb-2 text-xl font-semibold">Query Results:</h2>
			{#if results}
				<pre
					class="overflow-x-auto rounded border border-gray-300 bg-gray-100 p-4 text-sm">{JSON.stringify(
						results,
						null,
						2
					)}</pre>
			{:else if !isLoading}
				<!-- Optional: Placeholder if results are null and not loading -->
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					{currentQueryDefinition ? 'No results returned.' : 'Click a button to run a query...'}
				</div>
			{:else if isLoading}
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					Loading results...
				</div>
			{/if}
		</div>
	</div>
</div>

import type {
    QueryContext,
    QueryResult,
    StepResultItem,
    LoroHqlSelectStep,
    // LoroHqlMapValue // Removed unused import
} from '../hominio-types';

/**
 * Helper function for processing a select step
 */
export async function processSelectStep( // Added export
    step: LoroHqlSelectStep,
    context: QueryContext // Use defined type
): Promise<QueryResult[]> {
    const finalResults: QueryResult[] = [];

    if (!step.groupBy) {
        // Simple select - assumes context holds a single result object or requires iterating a specific variable?
        console.warn("Simple SELECT step (no groupBy) needs clear definition on what context variable to use.");
        // Example: Assume a single result object in context under a known key like 'finalData'?
        // Or iterate over the result of the *last* step that set resultVariable?
        // For now, return context as a single item for debugging.
        return [context as QueryResult];
    }

    // --- Grouping Logic --- 
    const groupByVar = step.groupBy;
    // Find the context variable that contains the array defining the groups
    // This needs a clear rule - e.g., assume it's the resultVariable of the first step?
    // Or maybe the step explicitly names the sourceVariable?

    // Find a context entry that is an array of StepResultItem
    let sourceArray: StepResultItem[] | null = null; // Use defined type
    let sourceVarName: string | null = null;
    for (const [key, value] of Object.entries(context)) {
        // Check if it's an array of potential StepResultItems
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'variables' in value[0]) {
            const potentialSourceArray = value as StepResultItem[]; // Tentative cast
            // Check if items in this array actually have the groupBy variable
            if (potentialSourceArray.some(item => typeof item === 'object' && item !== null && 'variables' in item && groupByVar in item.variables)) {
                sourceArray = potentialSourceArray;
                sourceVarName = key;
                break;
            }
        }
    }

    // FIX: Handle case where sourceArray is null or empty *before* trying to group
    if (!sourceArray || sourceArray.length === 0) {
        return []; // Return empty array directly
    }

    // Build groups Map<groupKey, correlatedContext>
    const groupedData = new Map<unknown, QueryContext>(); // Use defined type

    // 1. Initialize groups from the source array
    for (const item of sourceArray) {
        // Ensure item is a valid StepResultItem before accessing variables
        if (typeof item !== 'object' || item === null || !('variables' in item)) continue;

        const groupKey = item.variables[groupByVar];
        if (groupKey === undefined) continue; // Skip items without the group key

        if (!groupedData.has(groupKey)) {
            groupedData.set(groupKey, {}); // Initialize group context
        }
        const groupContext = groupedData.get(groupKey)!;

        // <<< START REFINED LOGIC: Prefix variables unless it's a simple single-source group case >>>
        // Determine if this is likely a simple grouping case (only one source array identified)
        // A more robust check might be needed, but this covers the current schema query.
        const isSimpleGroupCase = true; // Assume simple unless other potential sources exist
        // Example check (could be enhanced): Check if context has other arrays besides sourceVarName
        for (const key in context) {
            if (key !== sourceVarName && Array.isArray(context[key])) {
                // Found another array, might not be a simple case
                // isSimpleGroupCase = false; // Disable for now, assume simple
            }
        }

        for (const [varName, varValue] of Object.entries(item.variables)) {
            if (isSimpleGroupCase) {
                // Add directly without prefix
                groupContext[varName] = varValue;
            } else {
                // Keep prefixing logic for complex multi-source joins (like original task example)
                groupContext[`${sourceVarName}_${varName}`] = varValue;
                // Also add the groupBy variable without prefix for easy access
                if (varName === groupByVar) {
                    groupContext[varName] = varValue;
                }
            }
        }
        // <<< END REFINED LOGIC >>>

        // Store the raw source item itself? Might be useful but increases context size.
        // groupContext[sourceVarName] = item;
    }

    // 2. Correlate data from OTHER context arrays and FLATTEN relevant fields
    // <<< NEW: Iterate through potential secondary data arrays in context for correlation >>>
    for (const [otherVarName, otherValue] of Object.entries(context)) {
        if (otherVarName === sourceVarName || !Array.isArray(otherValue)) {
            continue; // Skip the source array itself and non-arrays
        }

        // Check if it looks like an array of StepResultItem
        if (otherValue.length > 0 && typeof otherValue[0] === 'object' && otherValue[0] !== null && 'variables' in otherValue[0]) {
            const otherDataArray = otherValue as StepResultItem[];

            // Iterate through each group we've built from the sourceArray
            for (const [groupKey, groupContext] of groupedData.entries()) {

                // --- BEGIN Specific Correlation Logic --- 

                // Logic for Todos: Correlate status
                if (otherVarName === 'statusDetails') {
                    const targetStatusLeafVar = groupContext[`${sourceVarName}_statusLeafVar`]; // Assumes sourceVarName is taskStatusLinks
                    if (targetStatusLeafVar) {
                        const statusItem = otherDataArray.find(item => item._sourceKey === targetStatusLeafVar);
                        if (statusItem && statusItem.variables?.statusValue !== undefined) {
                            groupContext['status'] = statusItem.variables.statusValue;
                        }
                    }
                }

                // Logic for Todos: Correlate name (multi-step, depends on entityNameLinks existing)
                if (otherVarName === 'nameDetails' && context['entityNameLinks']) {
                    const entityNameLinksArray = context['entityNameLinks'] as StepResultItem[] | undefined;
                    const entityLinkItem = entityNameLinksArray?.find(item => item.variables?.entityVar === groupKey); // groupKey is taskVar here
                    if (entityLinkItem && entityLinkItem.variables?.nameLeafVar) {
                        const targetNameLeafVar = entityLinkItem.variables.nameLeafVar;
                        const nameItem = otherDataArray.find(item => item._sourceKey === targetNameLeafVar);
                        if (nameItem && nameItem.variables?.nameValue !== undefined) {
                            groupContext['name'] = nameItem.variables.nameValue;
                        }
                    }
                }

                // Logic for LeafQueries: Correlate schema info (name, placeTitles, etc.)
                if (otherVarName === 'schemaInfo') {
                    const schemaIdToFind = groupContext['schema_id']; // schema_id comes from the foundComposites group
                    if (schemaIdToFind) {
                        const matchingSchemaInfo = otherDataArray.find(infoItem => infoItem.variables?.retrieved_schema_id === schemaIdToFind);
                        if (matchingSchemaInfo && typeof matchingSchemaInfo.variables === 'object') {
                            // <<< GENERIC CORRELATION: Copy all variables from schemaInfo result >>>
                            for (const [schemaVarKey, schemaVarValue] of Object.entries(matchingSchemaInfo.variables)) {
                                // Avoid overwriting the key used for matching, if necessary
                                // (In this case, 'retrieved_schema_id' is unlikely to clash with foundComposites vars)
                                // Prefixing could be added here if needed: e.g., groupContext[`schemaInfo_${schemaVarKey}`] = schemaVarValue;
                                groupContext[schemaVarKey] = schemaVarValue;
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Construct final results from grouped and flattened data
    for (const [groupKey, groupContext] of groupedData.entries()) {
        const resultItem: QueryResult = {};
        // Add the groupKey value using the groupBy variable name as the key
        if (step.groupBy) {
            resultItem[step.groupBy] = groupKey;
        }

        for (const [outputKey, valueDef] of Object.entries(step.select)) {
            if (typeof valueDef === 'object' && valueDef !== null) {
                // Resolve variable: Expects variables directly available in groupContext
                // (e.g., 'composite_key', 'schema_id', 'x1', 'name', 'placeTitles')
                if ('variable' in valueDef && typeof valueDef.variable === 'string') {
                    const varName = valueDef.variable;
                    resultItem[outputKey] = groupContext[varName];
                } else if ('literal' in valueDef) {
                    resultItem[outputKey] = valueDef.literal;
                } else if ('field' in valueDef && typeof valueDef.field === 'string') {
                    // This path is currently not hit in the groupBy logic, but kept for completeness
                    console.warn(`[Query Engine] SELECT (groupBy): Direct field access ('${valueDef.field}') within groupBy is not standard. Check logic.`);
                    // Need to decide how to resolve 'field' in this context - against groupContext? Original item?
                    resultItem[outputKey] = groupContext[valueDef.field]; // Tentative: Access group context
                } else {
                    console.warn(`[Query Engine] SELECT (groupBy): Unsupported value definition for output key '${outputKey}':`, valueDef);
                }
            } else {
                console.warn(`[Query Engine] SELECT (groupBy): Invalid value definition for output key '${outputKey}'. Expected object.`);
            }
        }
        finalResults.push(resultItem);
    }

    // <<< DEBUG LOG START >>>
    // console.log(`[Query Engine process-select.ts] Returning ${finalResults.length} items:`, JSON.stringify(finalResults));
    // <<< DEBUG LOG END >>>
    return finalResults;
} 
import type {
    QueryContext,
    QueryResult,
    LoroHqlAggregateStep,
    // AggregateFieldRule, // Removed unused import
} from '../hominio-types';

/**
 * Processes an aggregate step.
 */
export async function processAggregateStep( // Added export
    step: LoroHqlAggregateStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const inputData = context[step.fromVariable] as QueryResult[] | undefined;
    const groupMap = new Map<unknown, QueryResult>();

    if (!Array.isArray(inputData)) {
        console.warn(
            `[Query Engine AGGREGATE] Input variable '${step.fromVariable}' is not an array. Skipping aggregation.`
        );
        updatedContext[step.resultVariable] = [];
        return updatedContext;
    }

    for (const item of inputData) {
        if (typeof item !== 'object' || item === null) continue;

        const groupKey = item[step.groupByKey];
        if (groupKey === undefined) continue; // Skip items missing the group key

        if (!groupMap.has(groupKey)) {
            // First item for this group - initialize the aggregated object
            const newGroupItem: QueryResult = {};
            // Include the group key itself
            newGroupItem[step.groupByKey] = groupKey;

            for (const [outputField, rule] of Object.entries(step.aggregateFields)) {
                const sourceValue = item[rule.sourceField];
                if (rule.operation === 'first') {
                    newGroupItem[outputField] = sourceValue;
                } else if (rule.operation === 'collect') {
                    // Initialize array and add the first value (if it exists)
                    newGroupItem[outputField] = sourceValue !== undefined && sourceValue !== null ? [sourceValue] : [];
                } else {
                    console.warn(`[Query Engine AGGREGATE] Unsupported operation '${rule.operation}' for field '${outputField}'.`);
                }
            }
            groupMap.set(groupKey, newGroupItem);
        } else {
            // Existing group - update collected arrays
            const existingGroupItem = groupMap.get(groupKey)!;
            for (const [outputField, rule] of Object.entries(step.aggregateFields)) {
                if (rule.operation === 'collect') {
                    const sourceValue = item[rule.sourceField];
                    const currentArray = existingGroupItem[outputField] as unknown[];
                    // Add sourceValue if it exists and is not already in the array
                    if (sourceValue !== undefined && sourceValue !== null && !currentArray.includes(sourceValue)) {
                        currentArray.push(sourceValue);
                    }
                } // 'first' operation fields are already set from the first item
            }
        }
    }

    // Convert map values to array
    updatedContext[step.resultVariable] = Array.from(groupMap.values());
    return updatedContext;
} 
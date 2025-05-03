import type {
    QueryContext,
    QueryResult,
    JoinInputItem,
    StepResultItem,
    LoroHqlJoinStep,
    // LoroHqlJoinSource, // Removed unused import
} from '../hominio-types';

/**
 * Processes a join step.
 */
export async function processJoinStep( // Added export
    step: LoroHqlJoinStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const leftArray = context[step.left.variable] as JoinInputItem[] | undefined;
    const rightArray = context[step.right.variable] as JoinInputItem[] | undefined;
    const joinType = step.type ?? 'inner';
    const joinedResults: QueryResult[] = [];

    const isTagJoin = step.left.variable === 'baseTaskInfo' && step.right.variable === 'taskTagLinks';
    if (isTagJoin) {
        console.log(`[Query Engine JOIN DEBUG - Tags] Entering join step.`);
        console.log(`  - Left Array (${step.left.variable}, key: ${step.left.key}):`, JSON.stringify(leftArray));
        console.log(`  - Right Array (${step.right.variable}, key: ${step.right.key}):`, JSON.stringify(rightArray));
    }

    if (!Array.isArray(leftArray) || !Array.isArray(rightArray)) {
        console.warn(
            `[Query Engine JOIN] Input variables '${step.left.variable}' or '${step.right.variable}' are not arrays. Skipping join.`
        );
        updatedContext[step.resultVariable] = [];
        return updatedContext;
    }

    const rightMap = new Map<unknown, JoinInputItem[]>();
    for (const rightItem of rightArray) {
        let rightKey: unknown;
        if (typeof rightItem === 'object' && rightItem !== null) {
            if ('variables' in rightItem && typeof rightItem.variables === 'object' && rightItem.variables !== null) {
                rightKey = (rightItem as StepResultItem).variables[step.right.key];
            } else {
                rightKey = (rightItem as QueryResult)[step.right.key];
            }
            if (rightKey !== undefined) {
                if (!rightMap.has(rightKey)) {
                    rightMap.set(rightKey, []);
                }
                rightMap.get(rightKey)!.push(rightItem);
            }
        }
    }

    for (const leftItem of leftArray) {
        let leftKey: unknown;
        if (typeof leftItem === 'object' && leftItem !== null) {
            if ('variables' in leftItem && typeof leftItem.variables === 'object' && leftItem.variables !== null) {
                leftKey = (leftItem as StepResultItem).variables[step.left.key];
            } else {
                leftKey = (leftItem as QueryResult)[step.left.key];
            }
        }

        if (isTagJoin) {
            console.log(`[Query Engine JOIN DEBUG - Tags] Processing left item with key ${step.left.key}=${leftKey}`);
        }

        const matchingRightItems = leftKey !== undefined ? rightMap.get(leftKey) : undefined;

        if (isTagJoin) {
            if (matchingRightItems && matchingRightItems.length > 0) {
                console.log(`  - Found ${matchingRightItems.length} matching right item(s) for key ${leftKey}`);
            } else {
                console.log(`  - Found NO matching right item(s) for key ${leftKey}`);
            }
        }

        if (matchingRightItems && matchingRightItems.length > 0) {
            for (const rightItem of matchingRightItems) {
                const joinedItem: QueryResult = {};
                for (const [outputKey, sourceDef] of Object.entries(step.select)) {
                    if (sourceDef.source.startsWith('left.')) {
                        const varName = sourceDef.source.substring(5);
                        if (typeof leftItem === 'object' && leftItem !== null) {
                            if ('variables' in leftItem && typeof leftItem.variables === 'object' && leftItem.variables !== null) {
                                joinedItem[outputKey] = (leftItem as StepResultItem).variables[varName];
                            } else {
                                joinedItem[outputKey] = (leftItem as QueryResult)[varName];
                            }
                        } else {
                            joinedItem[outputKey] = undefined;
                        }
                    } else if (sourceDef.source.startsWith('right.')) {
                        const varName = sourceDef.source.substring(6);
                        if (typeof rightItem === 'object' && rightItem !== null) {
                            if ('variables' in rightItem && typeof rightItem.variables === 'object' && rightItem.variables !== null) {
                                joinedItem[outputKey] = (rightItem as StepResultItem).variables[varName];
                            } else {
                                joinedItem[outputKey] = (rightItem as QueryResult)[varName];
                            }
                        } else {
                            joinedItem[outputKey] = undefined;
                        }
                    } else {
                        console.warn(`[Query Engine JOIN] Invalid source '${sourceDef.source}' in select. Must start with 'left.' or 'right.'.`);
                    }
                }
                joinedResults.push(joinedItem);
            }
        } else if (joinType === 'left') {
            const joinedItem: QueryResult = {};
            for (const [outputKey, sourceDef] of Object.entries(step.select)) {
                if (sourceDef.source.startsWith('left.')) {
                    const varName = sourceDef.source.substring(5);
                    if (typeof leftItem === 'object' && leftItem !== null) {
                        if ('variables' in leftItem && typeof leftItem.variables === 'object' && leftItem.variables !== null) {
                            joinedItem[outputKey] = (leftItem as StepResultItem).variables[varName];
                        } else {
                            joinedItem[outputKey] = (leftItem as QueryResult)[varName];
                        }
                    } else {
                        joinedItem[outputKey] = undefined;
                    }
                } else {
                    joinedItem[outputKey] = undefined;
                }
            }
            joinedResults.push(joinedItem);
        }
    }

    updatedContext[step.resultVariable] = joinedResults;
    return updatedContext;
} 
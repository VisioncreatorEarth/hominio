import type { CapabilityUser } from '../hominio-caps';
import type {
    QueryContext,
    QueryResult,
    LoroHqlQueryExtended,
    LoroHqlStepBase,
    LoroHqlSetVarStep,
    LoroHqlFindStep,
    LoroHqlGetStep,
    LoroHqlSelectStep,
    LoroHqlIterateIndexStep,
    LoroHqlResolveStep,
    LoroHqlJoinStep,
    LoroHqlAggregateStep,
} from '../hominio-types';

// Import step processors
import { processFindStep } from './process-find';
import { processGetStep } from './process-get';
import { processSelectStep } from './process-select';
import { processIterateIndexStep } from './process-iterate-index';
import { processResolveStep } from './process-resolve';
import { processJoinStep } from './process-join';
import { processAggregateStep } from './process-aggregate';

/**
 * Main function to execute a LORO_HQL steps-based query.
 */
export async function executeQuery( // Added export
    query: LoroHqlQueryExtended,
    user: CapabilityUser | null = null
): Promise<QueryResult[]> {
    let context: QueryContext = {};
    let finalResults: QueryResult[] = [];
    let lastStepResultVariable: string | null = null;

    if (!query || typeof query !== 'object' || !Array.isArray(query.steps)) {
        console.error("[Query Engine] Invalid query format provided.", query);
        throw new Error("Invalid query format: Expected object with a steps array.");
    }

    try {
        for (const step of query.steps) {
            switch (step.action) {
                case 'setVar': {
                    const setVarStep = step as LoroHqlSetVarStep;
                    if (setVarStep.variables && typeof setVarStep.variables === 'object') {
                        for (const [varName, varDef] of Object.entries(setVarStep.variables)) {
                            if (typeof varDef === 'object' && varDef !== null && 'literal' in varDef) {
                                context[varName] = varDef.literal;
                            } else {
                                console.warn(`[Query Engine] SetVar step: Invalid definition for variable '${varName}'. Missing 'literal'.`);
                            }
                        }
                    }
                    break;
                }
                case 'find':
                    context = await processFindStep(step as LoroHqlFindStep, context);
                    break;
                case 'get':
                    context = await processGetStep(step as LoroHqlGetStep, context, user);
                    break;
                case 'select':
                    {
                        const selectResults = await processSelectStep(step as LoroHqlSelectStep, context);
                        if (step.resultVariable) {
                            context[step.resultVariable] = selectResults;
                        } else {
                            // If select is the last step and has no resultVariable, assume it's the final result
                            finalResults = selectResults;
                        }
                    }
                    break;
                case 'iterateIndex':
                    context = await processIterateIndexStep(step as LoroHqlIterateIndexStep, context);
                    break;
                case 'resolve':
                    context = await processResolveStep(step as LoroHqlResolveStep, context);
                    break;
                case 'join':
                    context = await processJoinStep(step as LoroHqlJoinStep, context);
                    break;
                case 'aggregate':
                    context = await processAggregateStep(step as LoroHqlAggregateStep, context);
                    break;
                default: {
                    // Use LoroHqlStepBase for safe access to action
                    const unknownAction = (step as LoroHqlStepBase)?.action ?? 'unknown';
                    console.error(`[Query Engine] Unsupported step action encountered: ${unknownAction}`);
                    throw new Error(`Unsupported step action: ${unknownAction}`);
                }
            }
            // Track the result variable of the last step that produces one
            if (step.resultVariable) {
                lastStepResultVariable = step.resultVariable;
            } else if (step.action !== 'setVar' && step.action !== 'select') { // select handles its own final result logic
                lastStepResultVariable = null; // Reset if a step doesn't set a variable (except setVar/select)
            }
        }

        // Determine final result:
        // 1. If 'select' was the last step without a resultVariable, use its output.
        // 2. Otherwise, use the content of the last tracked resultVariable.
        if (finalResults.length > 0) { // Simplified check as lastStepResultVariable doesn't invalidate final select
            // Case 1: Final select step determined the results
            // <<< DEBUG LOG START >>>
            // console.log("[Query Engine execute.ts] Returning finalResults directly from select step:", JSON.stringify(finalResults));
            // <<< DEBUG LOG END >>>
            return finalResults;
        } else if (lastStepResultVariable && context[lastStepResultVariable] !== undefined) {
            // Case 2: Use the result of the last step that set a variable
            const resultValue = context[lastStepResultVariable];
            // <<< DEBUG LOG START >>>
            // console.log(`[Query Engine execute.ts] Returning context[${lastStepResultVariable}]:`, JSON.stringify(resultValue));
            // <<< DEBUG LOG END >>>
            return Array.isArray(resultValue) ? resultValue as QueryResult[] : (resultValue ? [resultValue as QueryResult] : []);
        } else {
            // Default/Fallback: Should ideally not be reached if query is well-formed
            console.warn("[Query Engine] Query finished, but no clear final result identified (no final select or last resultVariable).");
            // <<< DEBUG LOG START >>>
            // console.log("[Query Engine execute.ts] Returning empty array (fallback).");
            // <<< DEBUG LOG END >>>
            return [];
        }

    } catch (error) {
        console.error("[Query Engine] Error during STEPS execution:", error);
        // Consider re-throwing or returning specific error structure
        return []; // Return empty on error for now
    }
} 
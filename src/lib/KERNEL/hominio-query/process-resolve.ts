import { LoroMap } from 'loro-crdt';
import {
    getLeafDoc,
    findCompositeDocsBySchemaAndPlace,
    getDataFromDoc,
} from '../loro-engine';
import { getIndexLeafPubKey } from '../index-registry';
import type {
    PlaceKey,
    QueryContext,
    QueryResult,
    LoroHqlResolveStep,
    // ResolveRule, // Removed as it's part of LoroHqlResolveStep implicitly
} from '../hominio-types';

/**
 * Helper function to perform the core logic of resolveLeafValue rule,
 * including the secondary lookup for concept types.
 */
async function resolveSingleLeafValue(
    pubkey: string | null | undefined,
    valueField: string,
    typeField: string,
    excludeType: string | undefined,
    cnemeSchemaPubKey: string | null
): Promise<[unknown | null]> {
    if (!pubkey) {
        return [null];
    }
    try {
        const leafDoc = await getLeafDoc(pubkey);
        if (!leafDoc) {
            return [null];
        }
        const data = getDataFromDoc(leafDoc);

        if (
            data &&
            typeof data === 'object'
        ) {
            const dataType = (data as Record<string, unknown>)[typeField];
            const dataValue = (data as Record<string, unknown>)[valueField];

            if (excludeType !== undefined && dataType === excludeType) {
                if (!cnemeSchemaPubKey) {
                    console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Cannot resolve concept - 'cneme' schema pubkey not available.`);
                    return [null];
                }
                try {
                    const relatedCnemeComposites = await findCompositeDocsBySchemaAndPlace(cnemeSchemaPubKey, 'x1', pubkey);

                    if (relatedCnemeComposites.length === 1) {
                        const cnemeComp = relatedCnemeComposites[0];
                        const cnemeData = getDataFromDoc(cnemeComp.doc) as { places: Record<PlaceKey, string> } | undefined;
                        const x2PubKey = cnemeData?.places?.x2;

                        if (x2PubKey) {
                            const x2LeafDoc = await getLeafDoc(x2PubKey);
                            if (x2LeafDoc) {
                                const x2Data = getDataFromDoc(x2LeafDoc);
                                if (x2Data && typeof x2Data === 'object' && (x2Data as Record<string, unknown>)[valueField] !== undefined) {
                                    const resolvedValue = (x2Data as Record<string, unknown>)[valueField];
                                    return [resolvedValue];
                                } else {
                                    console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Found cneme composite ${cnemeComp.pubkey}, but x2 leaf ${x2PubKey} has no '${valueField}' or invalid data. x2Data:`, x2Data);
                                }
                            } else {
                                console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Found cneme composite ${cnemeComp.pubkey}, but failed to load x2 leaf ${x2PubKey}.`);
                            }
                        } else {
                            console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Found cneme composite ${cnemeComp.pubkey}, but it has no x2 value.`);
                        }
                    }
                } catch (secondaryLookupError) {
                    console.error(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Error during secondary lookup:`, secondaryLookupError);
                }
                return [null];
            }

            if (dataValue !== undefined) {
                return [dataValue];
            }
        }
        return [null];
    } catch (error) {
        console.error(`resolveSingleLeafValue: Error fetching/processing leaf ${pubkey}:`, error);
        return [null];
    }
}

/**
 * Processes a 'resolve' step, performing conditional lookups based on previous results.
 */
export async function processResolveStep( // Added export
    step: LoroHqlResolveStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const inputData = context[step.fromVariable];
    const resolvedResults: QueryResult[] = [];

    let cnemeSchemaPubKey: string | null = null;
    try {
        const schemasIndexKey = await getIndexLeafPubKey('schemas');
        if (schemasIndexKey) {
            const indexDoc = await getLeafDoc(schemasIndexKey);
            if (indexDoc) {
                const valueMap = indexDoc.getMap('data')?.get('value') as LoroMap | undefined;
                cnemeSchemaPubKey = valueMap?.get('cneme') as string | undefined ?? null;
                if (!cnemeSchemaPubKey) {
                    console.warn("[Query Engine Resolve] Could not find pubkey for schema 'cneme' in the index.");
                }
            }
        }
    } catch (e) {
        console.error("[Query Engine Resolve] Error fetching 'cneme' schema pubkey:", e);
    }

    if (!Array.isArray(inputData)) {
        console.warn(`[Query Engine] Resolve step: Input variable '${step.fromVariable}' is not an array. Skipping.`);
        updatedContext[step.resultVariable] = [];
        return updatedContext;
    }

    for (const item of inputData) {
        if (typeof item !== 'object' || item === null) {
            console.warn(`[Query Engine] Resolve step: Skipping non-object item in '${step.fromVariable}'.`);
            continue;
        }

        const resolvedItem: QueryResult = { ...item };

        for (const [outputField, rule] of Object.entries(step.resolveFields)) {
            if (rule.type === 'resolveLeafValue') {
                const pubkey = item[rule.pubkeyVar] as string | undefined;
                const fallbackValue = item[rule.fallbackVar];
                const valueField = rule.valueField ?? 'value';
                const typeField = rule.typeField ?? 'type';
                const excludeType = rule.excludeType;

                try {
                    const [resolvedValue] = await resolveSingleLeafValue(
                        pubkey,
                        valueField,
                        typeField,
                        excludeType,
                        cnemeSchemaPubKey
                    );

                    resolvedItem[outputField] = resolvedValue !== null ? resolvedValue : fallbackValue;

                } catch (error) {
                    console.error(`[Query Engine] Resolve step: Error applying rule for '${outputField}' on item:`, item, error);
                    resolvedItem[outputField] = fallbackValue;
                }
            }
            else {
                const unknownType = (typeof rule === 'object' && rule !== null && 'type' in rule) ? rule.type : '(unknown format)';
                console.warn(`[Query Engine] Resolve step: Unsupported rule type '${unknownType}' for field '${outputField}'.`);
            }
        }
        resolvedResults.push(resolvedItem);
    }

    updatedContext[step.resultVariable] = resolvedResults;
    return updatedContext;
} 
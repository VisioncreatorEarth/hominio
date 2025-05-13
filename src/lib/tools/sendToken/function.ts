import { get } from 'svelte/store';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import type { Address, TransactionSerializableEIP1559 } from 'viem';
import {
    createPublicClient,
    http,
    parseUnits,
    encodeFunctionData,
    isAddress
} from 'viem';
import { gnosis } from 'viem/chains';
import { roadmapConfig } from '$lib/roadmap/config';
import { o } from '$lib/KERNEL/hominio-svelte'; // For accessing Svelte stores
import { requestPKPSignature } from '$lib/wallet/modalStore';
import type { PKPSignTransactionRequest } from '$lib/wallet/modalTypes'; // Changed to specific type
import { queryPrenusImplementation } from '$lib/tools/queryPrenus/function';
import type { AggregatedPrenuResult } from '$lib/tools/queryPrenus/function'; // Import result type
import { currentUserPkpProfileStore, type CurrentUserPkpProfile } from '$lib/stores/pkpSessionStore'; // Added PKP profile store

// --- Configuration from roadmap ---
const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
const SAHEL_TOKEN_ADDRESS = sahelPhaseConfig?.protocolTokenAddress as Address | undefined;
const EXPECTED_CHAIN_ID_SAHEL = gnosis.id;
const GNOSIS_RPC_URL = sahelPhaseConfig?.rpcUrls?.default?.http?.[0];
const TOKEN_SYMBOL = sahelPhaseConfig?.shortTokenName || 'SAHEL';

// --- ERC20 ABI subset needed for balance, decimals, and transfer ---
const erc20Abi = [
    {
        stateMutability: 'view' as const,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: 'balance', type: 'uint256' }],
        type: 'function'
    },
    {
        stateMutability: 'view' as const,
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        type: 'function'
    },
    {
        name: 'transfer',
        type: 'function' as const,
        stateMutability: 'nonpayable' as const,
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ name: 'success', type: 'bool' }]
    }
] as const;

export interface ExecuteSendTokenParams {
    // litNodeClient: LitNodeClient; // Removed
    // sessionSigs: SessionSigs; // Removed
    pkpEthAddress: Address; // Still needed for tx construction (nonce, gas estimation)
    recipientGuardianEoaAddress: Address;
    amount: string;
    sahelTokenDecimals?: number;
}

// Result type changed as txHash is no longer generated here.
export interface InitiateSendTokenResult {
    message: string;
    amountToSign: string;
    recipientAddress: Address;
    tokenSymbol: string;
    senderPkpAddress: Address;
}

// --- Core sending logic (modified executeSendSahelToGuardian) ---
async function internalInitiateSendToken(
    params: ExecuteSendTokenParams
): Promise<InitiateSendTokenResult> { // Return type changed
    const {
        pkpEthAddress, // Essential for building the transaction
        recipientGuardianEoaAddress,
        amount,
        sahelTokenDecimals: knownDecimals
    } = params;

    if (!SAHEL_TOKEN_ADDRESS) throw new Error('SAHEL Token address not configured.');
    if (!GNOSIS_RPC_URL) throw new Error('Gnosis RPC URL not configured.');
    if (!amount || parseFloat(amount) <= 0) throw new Error('Invalid or zero amount specified for sending.');
    if (!pkpEthAddress) throw new Error('internalExecuteSendToken: pkpEthAddress is required for signing.');

    const publicClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC_URL) });

    let decimalsToUse = knownDecimals;
    if (typeof decimalsToUse !== 'number') {
        try {
            decimalsToUse = await publicClient.readContract({
                address: SAHEL_TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: 'decimals'
            }) as number;
        } catch (decError) {
            console.warn('[sendTokenTool] Could not fetch token decimals, defaulting to 18:', decError);
            decimalsToUse = 18;
        }
    }

    const amountToSendBigInt = parseUnits(amount, decimalsToUse);
    const nonce = await publicClient.getTransactionCount({ address: pkpEthAddress, blockTag: 'pending' });
    const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
    if (!maxFeePerGas || !maxPriorityFeePerGas) throw new Error('Could not estimate EIP-1559 gas fees.');

    const encodedTransferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientGuardianEoaAddress, amountToSendBigInt]
    });

    const estimatedGas = await publicClient.estimateGas({
        account: pkpEthAddress,
        to: SAHEL_TOKEN_ADDRESS,
        data: encodedTransferData,
        value: 0n
    });

    const transaction: TransactionSerializableEIP1559 = {
        to: SAHEL_TOKEN_ADDRESS, value: 0n, data: encodedTransferData, nonce,
        gas: estimatedGas, maxFeePerGas, maxPriorityFeePerGas, chainId: EXPECTED_CHAIN_ID_SAHEL, type: 'eip1559'
    };

    // Construct the request for the modal. PKP details are omitted.
    const signingRequestData: PKPSignTransactionRequest = {
        type: 'transaction',
        transaction, // The unsigned transaction
        tokenDecimals: decimalsToUse // Optional for modal display
        // pkpPublicKey and pkpEthAddress are NOT included here.
        // The SignerModal will get them from currentUserPkpProfileStore.
    };

    // Call requestPKPSignature but DO NOT await it.
    // This will open the modal and the promise it returns will resolve/reject later.
    // The tool function will return before that happens.
    requestPKPSignature(signingRequestData)
        .then(signature => {
            // This block is for handling successful signature *after* the tool has already returned.
            // The signature and broadcasting will now be handled *inside* the SignerModal.
            // So, this .then() might just be for logging or a no-op if modal handles all post-sign.
            console.log('[sendTokenTool] Modal signing process completed (signature obtained). Broadcasting is now handled by the modal.', signature);
        })
        .catch(error => {
            // Handle modal cancellation or error *after* the tool has returned.
            console.warn('[sendTokenTool] Modal signing process failed or was cancelled:', error);
            // Log to tool activity if needed, but the primary tool response already happened.
            logToolActivity('sendToken', `Modal interaction failed or cancelled: ${error.message || error}`, false);
        });

    return {
        message: `Transaction to send ${amount} ${TOKEN_SYMBOL} to ${recipientGuardianEoaAddress} prepared. Please sign it in the Hominio Signer Modal.`,
        amountToSign: amount,
        recipientAddress: recipientGuardianEoaAddress,
        tokenSymbol: TOKEN_SYMBOL,
        senderPkpAddress: pkpEthAddress
    };
}

// --- Main Tool Implementation Function ---
export async function sendTokenImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[sendTokenTool] Called with parameters:', parameters);
    let finalPkpEthAddress: Address | null = null;
    let finalRecipientAddress: Address | null = null;
    let amountToSend: string | null = null;

    try {
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) parsedParams = parameters;
        else if (typeof parameters === 'string') try { parsedParams = JSON.parse(parameters); } catch { /* ignore parse error */ }

        if (parsedParams.amount && typeof parsedParams.amount === 'string' && parseFloat(parsedParams.amount) > 0) {
            amountToSend = parsedParams.amount;
        } else {
            throw new Error('Amount to send is required and must be a positive number string.');
        }

        // Get PKP details from parameters or fall back to store
        const profileFromStore: CurrentUserPkpProfile | null = get(currentUserPkpProfileStore);

        finalPkpEthAddress = (parsedParams.pkpEthAddress && typeof parsedParams.pkpEthAddress === 'string' && isAddress(parsedParams.pkpEthAddress))
            ? parsedParams.pkpEthAddress as Address
            : profileFromStore?.pkpEthAddress || null;


        if (!finalPkpEthAddress) {
            throw new Error('Sender PKP EthAddress not provided and could not be retrieved from session/store.');
        }

        // --- Determine Recipient Address --- 
        const recipientInput = parsedParams.recipientNameOrAddress as string | undefined;
        if (recipientInput) {
            if (isAddress(recipientInput)) {
                // Input is a valid address
                finalRecipientAddress = recipientInput;
                console.log(`[sendTokenTool] Using provided recipient address: ${finalRecipientAddress}`);
            } else {
                // Input is potentially a name, try to resolve via queryPrenus
                console.log(`[sendTokenTool] Recipient input "${recipientInput}" is not an address, attempting to resolve as name via queryPrenus...`);
                const prenuQueryResultString = await queryPrenusImplementation({}); // Call queryPrenus
                const prenuQueryResult = JSON.parse(prenuQueryResultString) as { success: boolean, prenus: AggregatedPrenuResult[], message?: string };

                if (!prenuQueryResult.success || !Array.isArray(prenuQueryResult.prenus)) {
                    throw new Error(`Failed to query prenus to resolve recipient name: ${prenuQueryResult.message || 'Unknown error'}`);
                }

                // Find prenu matching the name (case-insensitive comparison)
                const matchingPrenu = prenuQueryResult.prenus.find(p => p.name?.toLowerCase() === recipientInput.toLowerCase());

                if (matchingPrenu && matchingPrenu.walletAddress && isAddress(matchingPrenu.walletAddress)) {
                    finalRecipientAddress = matchingPrenu.walletAddress as Address;
                    console.log(`[sendTokenTool] Resolved name "${recipientInput}" to address: ${finalRecipientAddress}`);
                } else if (matchingPrenu) {
                    throw new Error(`Found prenu named "${recipientInput}", but they do not have a valid wallet address linked.`);
                } else {
                    throw new Error(`Could not find a prenu named "${recipientInput}" with a linked wallet address.`);
                }
            }
        } else {
            // No recipient input, default to Guardian EOA
            const guardianAddressFromStore = get(o.guardian.address);
            finalRecipientAddress = guardianAddressFromStore;
            console.log(`[sendTokenTool] No recipient specified, defaulting to Guardian EOA: ${finalRecipientAddress}`);
            if (!finalRecipientAddress) {
                throw new Error('Recipient Guardian EOA address not provided and could not be retrieved from session/storage.');
            }
        }

        if (!finalRecipientAddress) { // Should be unreachable if logic above is correct, but good failsafe
            throw new Error('Could not determine recipient address.');
        }


        const result = await internalInitiateSendToken({
            pkpEthAddress: finalPkpEthAddress, // Essential for tx construction
            recipientGuardianEoaAddress: finalRecipientAddress,
            amount: amountToSend
        });

        logToolActivity('sendToken', result.message);
        return JSON.stringify({
            success: true, // Indicates the request to sign was successfully initiated
            message: result.message,
            details: {
                amount: result.amountToSign,
                tokenSymbol: result.tokenSymbol,
                senderPkpAddress: result.senderPkpAddress,
                recipientAddress: result.recipientAddress,
                tokenAddress: SAHEL_TOKEN_ADDRESS,
                chainId: EXPECTED_CHAIN_ID_SAHEL,
                status: 'pending_signature' // New status
            }
        });

    } catch (error: unknown) {
        console.error('[sendTokenTool] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('sendToken', `Error: ${errorMessage}`, false);
        return JSON.stringify({
            success: false,
            message: `Error preparing send token transaction: ${errorMessage}`,
            details: {
                senderPkpAddress: finalPkpEthAddress,
                recipientAddress: finalRecipientAddress,
                amountAttempted: amountToSend,
                tokenSymbol: TOKEN_SYMBOL
            }
        });
    }
}

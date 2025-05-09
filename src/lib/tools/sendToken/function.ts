import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import type { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitPKPResource, LitActionResource } from '@lit-protocol/auth-helpers';
import type { SessionSigs, AuthCallbackParams } from '@lit-protocol/types';
import type { Hex, Address, TransactionSerializableEIP1559 } from 'viem';
import {
    createPublicClient,
    http,
    parseUnits,
    encodeFunctionData,
    serializeTransaction,
    isAddress
} from 'viem';
import { gnosis } from 'viem/chains';
import { roadmapConfig } from '$lib/roadmap/config';
import { signTransactionWithPKP } from '$lib/wallet/lit';
import { o } from '$lib/KERNEL/hominio-svelte'; // For accessing Svelte stores

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
    litNodeClient: LitNodeClient;
    sessionSigs: SessionSigs;
    pkpPublicKey: Hex;
    pkpEthAddress: Address;
    recipientGuardianEoaAddress: Address;
    amount: string;
    sahelTokenDecimals?: number;
}

export interface ExecuteSendTokenResult {
    txHash: Hex;
    amountSent: string;
    recipientAddress: Address;
    tokenSymbol: string;
}

// --- Helper to get PKP data from localStorage (similar to getPKPBalance) ---
async function getStoredPKPData(): Promise<{ pkpEthAddress: Address; pkpPublicKey: Hex } | null> {
    if (!browser) return null;
    const storedPKPDataString = localStorage.getItem('mintedPKPData');
    if (storedPKPDataString) {
        try {
            const storedPKPData = JSON.parse(storedPKPDataString);
            if (
                storedPKPData &&
                storedPKPData.pkpEthAddress && isAddress(storedPKPData.pkpEthAddress) &&
                storedPKPData.pkpPublicKey && typeof storedPKPData.pkpPublicKey === 'string'
            ) {
                return {
                    pkpEthAddress: storedPKPData.pkpEthAddress as Address,
                    pkpPublicKey: storedPKPData.pkpPublicKey as Hex
                };
            }
        } catch (error) {
            console.warn('[sendTokenTool] Error parsing mintedPKPData from localStorage:', error);
            return null;
        }
    }
    return null;
}

// --- Core sending logic (modified executeSendSahelToGuardian) ---
async function internalExecuteSendToken(
    params: ExecuteSendTokenParams
): Promise<ExecuteSendTokenResult> {
    const {
        litNodeClient,
        sessionSigs,
        pkpPublicKey,
        pkpEthAddress,
        recipientGuardianEoaAddress,
        amount,
        sahelTokenDecimals: knownDecimals
    } = params;

    // Prerequisite checks for configuration (already handled for client/session/pkp by caller)
    if (!SAHEL_TOKEN_ADDRESS) throw new Error('SAHEL Token address not configured.');
    if (!GNOSIS_RPC_URL) throw new Error('Gnosis RPC URL not configured.');
    if (!amount || parseFloat(amount) <= 0) throw new Error('Invalid or zero amount specified for sending.');

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

    const signature = await signTransactionWithPKP(litNodeClient, sessionSigs, pkpPublicKey, transaction);
    const signedRawTx = serializeTransaction(transaction, signature);
    const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedRawTx });

    return { txHash, amountSent: `${amount}`, recipientAddress: recipientGuardianEoaAddress, tokenSymbol: TOKEN_SYMBOL };
}

// --- Main Tool Implementation Function ---
export async function sendTokenImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[sendTokenTool] Called with parameters:', parameters);
    let finalPkpEthAddress: Address | null = null;
    let finalPkpPublicKey: Hex | null = null;
    let finalRecipientAddress: Address | null = null;
    let amountToSend: string | null = null;

    try {
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) parsedParams = parameters;
        else if (typeof parameters === 'string') try { parsedParams = JSON.parse(parameters); } catch { /* ignore parse error */ }

        // 0. Get Amount from parameters
        if (parsedParams.amount && typeof parsedParams.amount === 'string' && parseFloat(parsedParams.amount) > 0) {
            amountToSend = parsedParams.amount;
        } else {
            throw new Error('Amount to send is required and must be a positive number string.');
        }

        // 1. Get PKP Details (from params or localStorage)
        const storedPkp = await getStoredPKPData();
        finalPkpEthAddress = (parsedParams.pkpEthAddress && typeof parsedParams.pkpEthAddress === 'string' && isAddress(parsedParams.pkpEthAddress)) ? parsedParams.pkpEthAddress as Address : storedPkp?.pkpEthAddress || null;
        finalPkpPublicKey = (parsedParams.pkpPublicKey && typeof parsedParams.pkpPublicKey === 'string') ? parsedParams.pkpPublicKey as Hex : storedPkp?.pkpPublicKey || null;

        if (!finalPkpEthAddress || !finalPkpPublicKey) {
            throw new Error('Sender PKP details (EthAddress, PublicKey) not provided and could not be retrieved from session/storage.');
        }

        // 2. Get Recipient Guardian EOA (from params or Svelte store)
        const guardianAddressFromStore = get(o.guardian.address);
        finalRecipientAddress = (parsedParams.recipientGuardianEoaAddress && typeof parsedParams.recipientGuardianEoaAddress === 'string' && isAddress(parsedParams.recipientGuardianEoaAddress))
            ? parsedParams.recipientGuardianEoaAddress as Address
            : guardianAddressFromStore;

        if (!finalRecipientAddress) {
            throw new Error('Recipient Guardian EOA address not provided and could not be retrieved from session/storage.');
        }

        // 3. Get LitNodeClient from Svelte store
        const litNodeClient = get(o.lit.client);
        if (!litNodeClient || !litNodeClient.ready) {
            throw new Error('LitNodeClient not available or not ready. Ensure Lit Protocol is connected.');
        }

        // 4. Get SessionSigs (attempt to resume)
        let sessionSigs: SessionSigs;
        try {
            sessionSigs = await litNodeClient.getSessionSigs({
                pkpPublicKey: finalPkpPublicKey,
                chain: 'ethereum', // Or the chain PKP was minted on / primarily used with
                resourceAbilityRequests: [
                    { resource: new LitPKPResource('*'), ability: 'pkp-signing' as const },
                    { resource: new LitActionResource('*'), ability: 'lit-action-execution' as const }
                ],
                authNeededCallback: async (params: AuthCallbackParams) => {
                    console.error('[sendTokenTool] AuthNeededCallback triggered. Tool cannot handle interactive auth.', params);
                    throw new Error('Authentication required to proceed, but tool cannot handle interactive authentication. Ensure a resumable session exists.');
                }
            });
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error during session resumption';
            throw new Error(`Failed to get active session for PKP ${finalPkpPublicKey}: ${errorMessage}`);
        }

        if (!sessionSigs) {
            throw new Error('Could not obtain session signatures for the PKP. Ensure a resumable session exists.');
        }

        // 5. Execute the token send
        const result = await internalExecuteSendToken({
            litNodeClient,
            sessionSigs,
            pkpPublicKey: finalPkpPublicKey,
            pkpEthAddress: finalPkpEthAddress,
            recipientGuardianEoaAddress: finalRecipientAddress,
            amount: amountToSend
        });

        const successMessage = `Successfully sent ${result.amountSent} ${result.tokenSymbol} from ${finalPkpEthAddress} to ${result.recipientAddress}. TxHash: ${result.txHash}`;
        logToolActivity('sendToken', successMessage);
        return JSON.stringify({
            success: true,
            message: successMessage,
            txHash: result.txHash,
            amountSent: result.amountSent,
            tokenSymbol: result.tokenSymbol,
            senderPkpAddress: finalPkpEthAddress,
            recipientAddress: result.recipientAddress,
            tokenAddress: SAHEL_TOKEN_ADDRESS,
            chainId: EXPECTED_CHAIN_ID_SAHEL
        });

    } catch (error: unknown) {
        console.error('[sendTokenTool] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('sendToken', `Error: ${errorMessage}`, false);
        return JSON.stringify({
            success: false,
            message: `Error sending token: ${errorMessage}`,
            senderPkpAddress: finalPkpEthAddress,
            recipientAddress: finalRecipientAddress,
            amountAttempted: amountToSend,
            tokenSymbol: TOKEN_SYMBOL
        });
    }
}

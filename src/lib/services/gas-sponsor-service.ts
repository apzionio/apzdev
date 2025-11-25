/**
 * Gas Sponsor Service
 *
 * Implements the Aptos fee payer pattern for gas sponsorship.
 * Users sign only the transaction payload, platform (Geomid) pays gas.
 */

import { Aptos, Account, Ed25519PrivateKey, AccountAuthenticator, InputGenerateTransactionPayloadData } from '@aptos-labs/ts-sdk'
import { aptos } from '@/lib/aptos'
import { supabase } from '@/lib/supabase'
import type { GasStationConfig } from '@/types/market'

// Server-side only - fee payer account
let feePayerAccount: Account | null = null

/**
 * Initialize fee payer account (server-side only)
 */
function getFeePayerAccount(): Account {
  if (feePayerAccount) return feePayerAccount

  const privateKeyHex = process.env.GAS_SPONSOR_PRIVATE_KEY
  if (!privateKeyHex) {
    throw new Error('GAS_SPONSOR_PRIVATE_KEY not configured')
  }

  const privateKey = new Ed25519PrivateKey(privateKeyHex)
  feePayerAccount = Account.fromPrivateKey({ privateKey })

  return feePayerAccount
}

/**
 * Check if user has remaining gas quota for today
 */
export async function checkUserGasQuota(
  userAddress: string,
  requiredGas: number
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  const { data, error } = await supabase.rpc('check_user_gas_quota', {
    p_user_address: userAddress,
    p_required_amount: requiredGas,
  })

  if (error) {
    console.error('Error checking gas quota:', error)
    return { allowed: false, remaining: 0, message: 'Failed to check quota' }
  }

  return {
    allowed: data?.allowed ?? false,
    remaining: data?.remaining ?? 0,
    message: data?.message,
  }
}

/**
 * Record gas usage after successful transaction
 */
export async function recordGasUsage(
  userAddress: string,
  marketId: string,
  gasUsed: number,
  txHash: string,
  transactionType: string
): Promise<void> {
  const { error } = await supabase.rpc('record_gas_usage', {
    p_user_address: userAddress,
    p_market_id: marketId,
    p_gas_used: gasUsed,
    p_tx_hash: txHash,
    p_transaction_type: transactionType,
  })

  if (error) {
    console.error('Error recording gas usage:', error)
    // Don't throw - transaction already succeeded
  }
}

/**
 * Get gas station configuration
 */
export async function getGasStationConfig(): Promise<GasStationConfig | null> {
  const { data, error } = await supabase
    .from('gas_station_config')
    .select('*')
    .single()

  if (error) {
    console.error('Error fetching gas station config:', error)
    return null
  }

  return data
}

/**
 * Check if gas sponsorship is enabled
 */
export async function isGasSponsorshipEnabled(): Promise<boolean> {
  const config = await getGasStationConfig()
  return config?.enabled ?? false
}

/**
 * Build a sponsored transaction
 * Returns the transaction and fee payer authenticator
 */
export async function buildSponsoredTransaction(params: {
  senderAddress: string
  functionPath: string
  functionArguments: InputGenerateTransactionPayloadData['functionArguments']
  typeArguments?: InputGenerateTransactionPayloadData['typeArguments']
}): Promise<{
  transaction: Awaited<ReturnType<typeof aptos.transaction.build.simple>>
  feePayerAuthenticator: AccountAuthenticator
}> {
  const { senderAddress, functionPath, functionArguments, typeArguments = [] } = params

  // Build transaction with fee payer
  const transaction = await aptos.transaction.build.simple({
    sender: senderAddress,
    withFeePayer: true, // Enable fee payer mode
    data: {
      function: functionPath as `${string}::${string}::${string}`,
      functionArguments,
      typeArguments,
    },
  })

  // Sign as fee payer
  const feePayer = getFeePayerAccount()
  const feePayerAuthenticator = aptos.transaction.signAsFeePayer({
    signer: feePayer,
    transaction,
  })

  return { transaction, feePayerAuthenticator }
}

/**
 * Submit a sponsored transaction with user's signature
 */
export async function submitSponsoredTransaction(params: {
  transaction: Awaited<ReturnType<typeof aptos.transaction.build.simple>>
  senderAuthenticator: AccountAuthenticator
  feePayerAuthenticator: AccountAuthenticator
}): Promise<string> {
  const { transaction, senderAuthenticator, feePayerAuthenticator } = params

  const pendingTx = await aptos.transaction.submit.simple({
    transaction,
    senderAuthenticator,
    feePayerAuthenticator,
  })

  // Wait for transaction
  const result = await aptos.waitForTransaction({
    transactionHash: pendingTx.hash,
  })

  if (!result.success) {
    throw new Error(`Transaction failed: ${result.vm_status}`)
  }

  return pendingTx.hash
}

/**
 * Get fee payer address (for client-side display)
 */
export function getFeePayerAddress(): string {
  const address = process.env.NEXT_PUBLIC_GAS_SPONSOR_ADDRESS
  if (!address) {
    throw new Error('NEXT_PUBLIC_GAS_SPONSOR_ADDRESS not configured')
  }
  return address
}

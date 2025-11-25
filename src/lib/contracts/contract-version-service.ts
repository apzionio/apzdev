/**
 * Contract Version Service
 *
 * CRITICAL: ALL contract addresses come from the database (blockchain_contracts table)
 * NEVER hardcode contract addresses or module names!
 */

import { supabase } from '@/lib/supabase'
import type { BlockchainContract } from '@/types/market'

// Cache for contract versions (1 minute TTL)
let contractCache: Map<string, BlockchainContract> = new Map()
let cacheTimestamp = 0
const CACHE_TTL = 60 * 1000 // 1 minute

const network = process.env.NEXT_PUBLIC_APTOS_NETWORK || 'testnet'

/**
 * Refresh contract versions from database
 */
export async function refreshContractVersions(): Promise<void> {
  contractCache.clear()
  cacheTimestamp = 0
  await loadContractVersions()
}

/**
 * Load all latest contract versions from database
 */
async function loadContractVersions(): Promise<void> {
  const now = Date.now()
  if (cacheTimestamp > 0 && now - cacheTimestamp < CACHE_TTL) {
    return // Cache still valid
  }

  const { data, error } = await supabase
    .from('blockchain_contracts')
    .select('*')
    .eq('is_latest', true)
    .eq('network', network)
    .eq('deployment_status', 'active')

  if (error) {
    console.error('Failed to load contract versions:', error)
    throw new Error(`Failed to load contract versions: ${error.message}`)
  }

  contractCache.clear()
  for (const contract of data || []) {
    // Cache by version key (e.g., 'v3-binary-safe', 'v4-multi')
    contractCache.set(contract.version, contract)
    // Also cache by contract type for easier lookup
    contractCache.set(`type:${contract.contract_type}`, contract)
  }

  cacheTimestamp = now
}

/**
 * Get contract by version
 */
export async function getContractByVersion(version: string): Promise<BlockchainContract | null> {
  await loadContractVersions()
  return contractCache.get(version) || null
}

/**
 * Get latest V3 Binary contract
 */
export async function getV3BinaryContract(): Promise<BlockchainContract> {
  await loadContractVersions()

  // Try known version names
  const contract = contractCache.get('v3-binary-safe') ||
                   contractCache.get('v3-binary') ||
                   Array.from(contractCache.values()).find(c =>
                     c.version.includes('v3-binary') && c.is_latest
                   )

  if (!contract) {
    throw new Error('V3 Binary contract not found in database. Please add it to blockchain_contracts table.')
  }

  return contract
}

/**
 * Get latest V3 Multi contract
 */
export async function getV3MultiContract(): Promise<BlockchainContract> {
  await loadContractVersions()

  const contract = contractCache.get('v3-multi-safe') ||
                   contractCache.get('v3-multi') ||
                   Array.from(contractCache.values()).find(c =>
                     c.version.includes('v3-multi') && c.is_latest
                   )

  if (!contract) {
    throw new Error('V3 Multi contract not found in database. Please add it to blockchain_contracts table.')
  }

  return contract
}

/**
 * Get latest V4 Binary contract (for MOI children)
 */
export async function getV4BinaryContract(): Promise<BlockchainContract> {
  await loadContractVersions()

  const contract = contractCache.get('v4-binary') ||
                   Array.from(contractCache.values()).find(c =>
                     c.version.includes('v4-binary') && c.is_latest
                   )

  if (!contract) {
    throw new Error('V4 Binary contract not found in database. Please add it to blockchain_contracts table.')
  }

  return contract
}

/**
 * Get latest V4 Multi contract (coordinator for MOI parent)
 */
export async function getV4MultiContract(): Promise<BlockchainContract> {
  await loadContractVersions()

  const contract = contractCache.get('v4-multi') ||
                   Array.from(contractCache.values()).find(c =>
                     c.version.includes('v4-multi') && c.is_latest
                   )

  if (!contract) {
    throw new Error('V4 Multi contract not found in database. Please add it to blockchain_contracts table.')
  }

  return contract
}

/**
 * Get V3 Binary function path
 * @example getV3BinaryFunctionPath('buy_with_apt') → "0xda1a...::v3AMMbinary::buy_with_apt"
 */
export async function getV3BinaryFunctionPath(
  functionName: string,
  overrideModuleName?: string | null
): Promise<string> {
  const contract = await getV3BinaryContract()
  const moduleName = overrideModuleName || contract.module_names[0]
  return `${contract.account_address}::${moduleName}::${functionName}`
}

/**
 * Get V3 Multi function path
 */
export async function getV3MultiFunctionPath(
  functionName: string,
  overrideModuleName?: string | null
): Promise<string> {
  const contract = await getV3MultiContract()
  const moduleName = overrideModuleName || contract.module_names[0]
  return `${contract.account_address}::${moduleName}::${functionName}`
}

/**
 * Get V4 Binary function path (for child markets)
 */
export async function getV4BinaryFunctionPath(
  functionName: string,
  overrideModuleName?: string | null
): Promise<string> {
  const contract = await getV4BinaryContract()
  const moduleName = overrideModuleName || contract.module_names[0]
  return `${contract.account_address}::${moduleName}::${functionName}`
}

/**
 * Get V4 MOI function path (coordinator)
 */
export async function getV4MOIFunctionPath(
  functionName: string,
  overrideModuleName?: string | null
): Promise<string> {
  const contract = await getV4MultiContract()
  const moduleName = overrideModuleName || contract.module_names[0]
  return `${contract.account_address}::${moduleName}::${functionName}`
}

/**
 * Get platform address (main contract account)
 */
export async function getPlatformAddress(): Promise<string> {
  const contract = await getV3BinaryContract()
  return contract.account_address
}

/**
 * Get function path based on market system
 */
export async function getMarketFunctionPath(
  marketSystem: string,
  functionName: string,
  overrideModuleName?: string | null
): Promise<string> {
  switch (marketSystem) {
    case 'v3-binary':
      return getV3BinaryFunctionPath(functionName, overrideModuleName)
    case 'v3-multi':
      return getV3MultiFunctionPath(functionName, overrideModuleName)
    case 'v4-binary':
      return getV4BinaryFunctionPath(functionName, overrideModuleName)
    case 'v4-multi':
      return getV4MOIFunctionPath(functionName, overrideModuleName)
    default:
      throw new Error(`Unknown market system: ${marketSystem}`)
  }
}

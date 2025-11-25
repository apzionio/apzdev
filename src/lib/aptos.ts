import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk'

const network = (process.env.NEXT_PUBLIC_APTOS_NETWORK as Network) || Network.TESTNET

// Get RPC URL from environment
function getAptosRpcUrl(): string | undefined {
  const rpcUrl = process.env.NEXT_PUBLIC_APTOS_RPC_URL
  if (rpcUrl) return rpcUrl

  // Default RPC URLs per network
  const defaultRpcs: Record<string, string> = {
    testnet: 'https://fullnode.testnet.aptoslabs.com/v1',
    mainnet: 'https://fullnode.mainnet.aptoslabs.com/v1',
  }

  return defaultRpcs[network]
}

const config = new AptosConfig({
  network,
  fullnode: getAptosRpcUrl(),
})

export const aptos = new Aptos(config)

export { network }

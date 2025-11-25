'use client'

import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react'
import { Network } from '@aptos-labs/ts-sdk'
import { PropsWithChildren } from 'react'

const network = (process.env.NEXT_PUBLIC_APTOS_NETWORK as Network) || Network.TESTNET

export function WalletProvider({ children }: PropsWithChildren) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network,
        aptosConnect: { dappId: 'apzion-prediction-market' },
      }}
      onError={(error) => {
        console.error('Wallet error:', error)
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  )
}

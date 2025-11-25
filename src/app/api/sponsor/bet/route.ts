import { NextRequest, NextResponse } from 'next/server'
import { buildSponsoredTransaction, checkUserGasQuota } from '@/lib/services/gas-sponsor-service'
import { getMarketFunctionPath } from '@/lib/contracts/contract-version-service'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, marketId, marketAddress, optionIndex, amount } = body

    // Validate input
    if (!userAddress || !marketId || optionIndex === undefined || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Fetch market to verify it's gas sponsored
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      return NextResponse.json(
        { error: 'Market not found' },
        { status: 404 }
      )
    }

    if (!market.is_gas_sponsored) {
      return NextResponse.json(
        { error: 'This market does not support gas sponsorship' },
        { status: 400 }
      )
    }

    if (market.status !== 'active') {
      return NextResponse.json(
        { error: 'Market is not active' },
        { status: 400 }
      )
    }

    // Estimate gas cost (typical bet transaction)
    const estimatedGas = 100000 // 0.001 APT

    // Check user's gas quota
    const quotaCheck = await checkUserGasQuota(userAddress, estimatedGas)
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Gas quota exceeded',
          message: quotaCheck.message,
          remaining: quotaCheck.remaining,
        },
        { status: 429 }
      )
    }

    // Get the function path based on market system
    const functionPath = await getMarketFunctionPath(
      market.market_system,
      'buy_with_apt',
      market.contract_module_name
    )

    // Build sponsored transaction
    const { transaction, feePayerAuthenticator } = await buildSponsoredTransaction({
      senderAddress: userAddress,
      functionPath,
      functionArguments: [
        marketAddress || market.market_object_address,
        optionIndex,
        BigInt(amount),
      ],
    })

    // Return transaction data for user to sign
    // Note: In production, you'd serialize these properly
    return NextResponse.json({
      success: true,
      transaction: {
        // Serialized transaction data would go here
        sender: userAddress,
        functionPath,
        optionIndex,
        amount,
      },
      feePayerAddress: process.env.NEXT_PUBLIC_GAS_SPONSOR_ADDRESS,
      estimatedGas,
      message: 'Transaction ready for user signature',
    })
  } catch (error) {
    console.error('Sponsor bet error:', error)
    return NextResponse.json(
      { error: 'Failed to create sponsored transaction' },
      { status: 500 }
    )
  }
}

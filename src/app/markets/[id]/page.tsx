import { Header } from '@/components/Header'
import { MarketDetailPage } from '@/components/markets/MarketDetailPage'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MarketPage({ params }: PageProps) {
  const { id } = await params

  return (
    <main className="min-h-screen">
      <Header />
      <div className="container py-6">
        <MarketDetailPage marketId={id} />
      </div>
    </main>
  )
}

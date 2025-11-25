import { Header } from '@/components/Header'
import { MarketsPage } from '@/components/markets/MarketsPage'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="container py-6">
        <MarketsPage />
      </div>
    </main>
  )
}

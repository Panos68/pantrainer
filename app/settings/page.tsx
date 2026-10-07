import Link from 'next/link'
import PasskeysSection from '@/components/settings/PasskeysSection'
import ApiTokensSection from '@/components/settings/ApiTokensSection'
import EquipmentSection from '@/components/settings/EquipmentSection'
import ImportHistorySection from '@/components/settings/ImportHistorySection'

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-mono font-bold tracking-widest uppercase">Settings</h1>
          <Link href="/" className="text-xs font-mono text-zinc-500 hover:text-zinc-300">← Home</Link>
        </div>
        <PasskeysSection />
        <EquipmentSection />
        <ImportHistorySection />
        <ApiTokensSection />
      </div>
    </main>
  )
}

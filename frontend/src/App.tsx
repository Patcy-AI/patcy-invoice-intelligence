import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

type Invoice = {
  document_type: string
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  purchase_order: string | null
  currency: string | null
  vendor_name: string | null
  vendor_vat_id: string | null
  customer_name: string | null
  customer_vat_id: string | null
  subtotal: string | null
  total_tax: string | null
  invoice_total: string | null
  field_confidence: Record<string, number>
}
type Review = { summary: string; recommended_action: string; gl_account: string; reasoning: string }
type ProcessResponse = {
  id: number; status: string; invoice: Invoice; issues: string[]; anomalies: string[]; review: Review
}
type SavedInvoice = {
  id: number; invoice_number: string | null; vendor_name: string | null
  invoice_total: string | null; status: string; issues: string[]; created_at: string
}

const FIELDS: [keyof Invoice, string][] = [
  ['invoice_number', 'Invoice #'], ['vendor_name', 'Vendor'], ['vendor_vat_id', 'Vendor VAT'],
  ['purchase_order', 'PO'], ['customer_name', 'Customer'], ['currency', 'Currency'],
  ['invoice_date', 'Date'], ['due_date', 'Due'], ['subtotal', 'Subtotal'],
  ['total_tax', 'Tax'], ['invoice_total', 'Total'],
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M12 2 L21 12 L12 22 L3 12 Z" stroke="#f59e0b" strokeWidth="1.6" />
        <path d="M12 7 L16.5 12 L12 17 L7.5 12 Z" fill="#f59e0b" />
      </svg>
      <div className="leading-none">
        <div className="text-lg font-semibold tracking-tight text-white">Patcy</div>
        <div className="text-[10px] uppercase tracking-widest text-amber-500/80">Invoice Intelligence</div>
      </div>
    </div>
  )
}

function confMeta(value: string | null | undefined, c: number | undefined) {
  if (value == null || value === '') return { label: 'not found', cls: 'text-amber-400' }
  if (c == null) return { label: '', cls: 'text-slate-500' }
  const pct = Math.round(c * 100) + '%'
  if (c >= 0.9) return { label: pct, cls: 'text-emerald-400' }
  if (c >= 0.75) return { label: pct + ' · check', cls: 'text-amber-400' }
  return { label: pct + ' · check', cls: 'text-red-400' }
}

function StatusBadge({ status }: { status: string }) {
  const c =
    status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
    : status === 'rejected' ? 'bg-red-500/15 text-red-400 ring-red-500/30'
    : status === 'changes_requested' ? 'bg-blue-500/15 text-blue-400 ring-blue-500/30'
    : 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c}`}>{status}</span>
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessResponse | null>(null)
  const [invoices, setInvoices] = useState<SavedInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadInvoices() {
    try { setInvoices(await (await fetch(`${API}/invoices`)).json()) } catch { /* backend down */ }
  }
  useEffect(() => { loadInvoices() }, [])

  function pick(f: File | null) {
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
    setResult(null)
  }

  async function handleProcess() {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API}/process`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setResult(await res.json())
      await loadInvoices()
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  async function decide(id: number, action: string) {
    await fetch(`${API}/invoices/${id}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    await loadInvoices()
    if (result && result.id === id) setResult({ ...result, status: action })
  }

  const flagged = result && (result.issues.length > 0 || result.anomalies.length > 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <span className="text-xs text-slate-500">catches what shouldn't be there</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {/* Upload */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-amber-500/50">
              {file ? file.name : 'Choose a document (PDF or image)'}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            </label>
            <button onClick={handleProcess} disabled={!file || loading}
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </section>

        {/* Result cockpit */}
        {result && (
          <section className="space-y-4">
            {flagged
              ? <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="font-semibold text-amber-300">⚠ Needs attention</p>
                  {result.anomalies.map((a) => <p key={a} className="mt-1 text-sm text-amber-200">{a}</p>)}
                  {result.issues.length > 0 &&
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.issues.map((i) => (
                        <span key={i} className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300 ring-1 ring-red-500/30">{i}</span>
                      ))}
                    </div>}
                </div>
              : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                  ✓ Clean — no issues or anomalies detected.
                </div>}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Document preview */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
                <div className="border-b border-slate-800 px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Document</div>
                {preview && file?.type === 'application/pdf'
                  ? <iframe title="doc" src={preview} className="h-[560px] w-full bg-white" />
                  : preview
                    ? <img src={preview} alt="doc" className="max-h-[560px] w-full object-contain bg-white" />
                    : <div className="p-8 text-slate-500">No preview</div>}
              </div>

              {/* Extracted data + confidence */}
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-400">{result.invoice.document_type}</span>
                  <StatusBadge status={result.status} />
                </div>

                <div className="divide-y divide-slate-800">
                  {FIELDS.map(([key, label]) => {
                    const value = result.invoice[key] as string | null
                    const c = result.invoice.field_confidence[key as string]
                    const m = confMeta(value, c)
                    return (
                      <div key={key as string} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-400">{label}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-slate-100">{value ?? '—'}</span>
                          {m.label && <span className={`text-[11px] ${m.cls}`}>{m.label}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="rounded-lg bg-slate-800/60 p-3 text-sm">
                  <p className={`font-semibold ${result.review.recommended_action === 'approve' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    AI recommends: {result.review.recommended_action}
                  </p>
                  <p className="mt-1 text-slate-300">{result.review.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">GL account: {result.review.gl_account}</p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => decide(result.id, 'approved')}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Approve</button>
                  <button onClick={() => decide(result.id, 'rejected')}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">Reject</button>
                  <button onClick={() => decide(result.id, 'changes_requested')}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">Changes</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* History */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Processed documents</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-2">#</th><th>Invoice</th><th>Vendor</th><th>Total</th><th>Issues</th><th>Status</th></tr>
            </thead>
            <tbody className="text-slate-300">
              {invoices.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="py-2">{r.id}</td>
                  <td>{r.invoice_number ?? '—'}</td>
                  <td>{r.vendor_name ?? '—'}</td>
                  <td>{r.invoice_total ?? '—'}</td>
                  <td>{r.issues.length > 0 ? <span className="text-red-400">{r.issues.length}</span> : <span className="text-emerald-400">0</span>}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={6} className="py-4 text-slate-600">Nothing processed yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_BASE_URL || ''

type Invoice = {
  document_type: string
  invoice_number: string | null; invoice_date: string | null; due_date: string | null
  purchase_order: string | null; currency: string | null
  vendor_name: string | null; vendor_vat_id: string | null
  customer_name: string | null; customer_vat_id: string | null
  subtotal: string | null; total_tax: string | null; invoice_total: string | null
  field_confidence: Record<string, number>
}
type Review = { summary: string; recommended_action: string; gl_account: string; reasoning: string }
type ProcessResponse = {
  id: number; status: string; invoice: Invoice; issues: string[]; anomalies: string[]
  review: Review; approved_by?: string | null; released_by?: string | null
}
type SavedInvoice = {
  id: number; invoice_number: string | null; vendor_name: string | null
  invoice_total: string | null; status: string; issues: string[]
  approved_by?: string | null; released_by?: string | null; created_at: string
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
    status === 'paid' ? 'bg-teal-500/15 text-teal-300 ring-teal-500/30'
    : status === 'awaiting_payment' ? 'bg-blue-500/15 text-blue-300 ring-blue-500/30'
    : status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
    : status === 'rejected' ? 'bg-red-500/15 text-red-400 ring-red-500/30'
    : status === 'changes_requested' ? 'bg-slate-500/15 text-slate-300 ring-slate-500/30'
    : 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c}`}>{status.replace(/_/g, ' ')}</span>
}

export default function App() {
  const [approver, setApprover] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessResponse | null>(null)
  const [invoices, setInvoices] = useState<SavedInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromHistory, setFromHistory] = useState(false)

  async function loadInvoices() {
    try { setInvoices(await (await fetch(`${API}/invoices`)).json()) } catch { /* backend down */ }
  }
  useEffect(() => { loadInvoices() }, [])

  function pick(f: File | null) {
    setFile(f); setPreview(f ? URL.createObjectURL(f) : null); setResult(null); setFromHistory(false)
  }
  function newReview() {
    setFile(null); setPreview(null); setResult(null); setError(null); setFromHistory(false)
  }

  async function handleProcess() {
    if (!file) return
    setLoading(true); setError(null); setResult(null); setFromHistory(false)
    try {
      const form = new FormData(); form.append('file', file)
      const res = await fetch(`${API}/process`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setResult(await res.json()); await loadInvoices()
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  async function openStored(id: number) {
    try {
      const res = await fetch(`${API}/invoices/${id}`)
      if (!res.ok) return
      setResult(await res.json()); setPreview(null); setFile(null); setFromHistory(true); setError(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { /* ignore */ }
  }

  async function decide(id: number, action: string) {
    if (action === 'approved' && !approver.trim()) { setError('Enter your name (Reviewer, top-right) before approving.'); return }
    await fetch(`${API}/invoices/${id}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, by: approver }),
    })
    setError(null); await loadInvoices()
    if (result && result.id === id) {
      const next = action === 'approved' ? 'awaiting_payment' : action
      setResult({ ...result, status: next, approved_by: action === 'approved' ? approver : result.approved_by })
    }
  }

  async function releasePayment(id: number) {
    if (!approver.trim()) { setError('Enter your name (Reviewer, top-right) before releasing payment.'); return }
    const res = await fetch(`${API}/invoices/${id}/release`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: approver }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({ detail: 'Release failed' }))
      setError(d.detail || 'Release failed'); return
    }
    setError(null); await loadInvoices()
    if (result && result.id === id) setResult({ ...result, status: 'paid', released_by: approver })
  }

  const flagged = result && (result.issues.length > 0 || result.anomalies.length > 0)
  const queue = invoices.filter((i) => i.status === 'awaiting_payment')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Reviewer:
            <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="your name"
              className="w-32 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-amber-500/50" />
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
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
            {(result || file) && (
              <button onClick={newReview}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">+ New review</button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </section>

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
              : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">✓ Clean — no issues or anomalies detected.</div>}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
                <div className="border-b border-slate-800 px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Document</div>
                {preview && file?.type === 'application/pdf'
                  ? <iframe title="doc" src={preview} className="h-[560px] w-full bg-white" />
                  : preview
                    ? <img src={preview} alt="doc" className="max-h-[560px] w-full object-contain bg-white" />
                    : <div className="p-8 text-sm text-slate-500">{fromHistory ? 'Original document is not stored for past reviews.' : 'No preview'}</div>}
              </div>

              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-400">{result.invoice.document_type}</span>
                  <StatusBadge status={result.status} />
                </div>

                <div className="divide-y divide-slate-800">
                  {FIELDS.map(([key, label]) => {
                    const value = result.invoice[key] as string | null
                    const c = result.invoice.field_confidence?.[key as string]
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
                  <p className={`font-semibold ${result.review.recommended_action === 'approve' ? 'text-emerald-400' : 'text-amber-400'}`}>AI recommends: {result.review.recommended_action}</p>
                  <p className="mt-1 text-slate-300">{result.review.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">GL account: {result.review.gl_account}</p>
                </div>

                {/* decision area — depends on status */}
                {result.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => decide(result.id, 'approved')} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Approve</button>
                    <button onClick={() => decide(result.id, 'rejected')} className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">Reject</button>
                    <button onClick={() => decide(result.id, 'changes_requested')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">Changes</button>
                  </div>
                )}
                {result.status === 'awaiting_payment' && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
                    <p className="text-blue-200">Approved by <b>{result.approved_by ?? '—'}</b> — queued for payment. A <b>different</b> reviewer must release it.</p>
                    <button onClick={() => releasePayment(result.id)} className="mt-2 w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-500">Release payment</button>
                  </div>
                )}
                {result.status === 'paid' && (
                  <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-sm text-teal-200">✓ Paid — approved by <b>{result.approved_by ?? '—'}</b>, released by <b>{result.released_by ?? '—'}</b>.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Payment queue */}
        {queue.length > 0 && (
          <section className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
            <h2 className="mb-1 text-sm font-medium text-blue-200">Payment queue — awaiting second approval</h2>
            <p className="mb-3 text-xs text-slate-500">Release requires a reviewer different from the approver (segregation of duties).</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-2">#</th><th>Vendor</th><th>Total</th><th>Approved by</th><th></th></tr>
              </thead>
              <tbody className="text-slate-300">
                {queue.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="py-2">{r.id}</td>
                    <td>{r.vendor_name ?? '—'}</td>
                    <td>{r.invoice_total ?? '—'}</td>
                    <td className="text-slate-400">{r.approved_by ?? '—'}</td>
                    <td className="text-right">
                      <button onClick={() => releasePayment(r.id)}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500">Release payment</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Review history */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Review history</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-2">#</th><th>Invoice</th><th>Vendor</th><th>Total</th><th>Issues</th><th>Status</th></tr>
            </thead>
            <tbody className="text-slate-300">
              {invoices.map((r) => (
                <tr key={r.id} onClick={() => openStored(r.id)} className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/40">
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
          <p className="mt-2 text-xs text-slate-600">Click any row to reopen its saved review.</p>
        </section>
      </main>
    </div>
  )
}

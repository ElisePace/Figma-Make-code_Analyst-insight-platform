// Tomoro — Research sidekick prototype ("Show your working") — v7
import { useEffect, useRef, useState } from 'react'

/* ---------------------------------------------------------------- data --- */

type Quarter = { label: string; value: number; projected?: boolean }
const REVENUE: Quarter[] = [
  { label: 'Q1', value: 8.4 },
  { label: 'Q2', value: 9.6 },
  { label: 'Q3', value: 8.45 },
  { label: 'Q4', value: 8.9, projected: true },
]

type Source = {
  id: number
  title: string
  type: string
  updated: string
  snippet: string
  rows: { k: string; v: string }[]
}
const SOURCES: Source[] = [
  {
    id: 1,
    title: 'Revenue warehouse — Q3 rollup',
    type: 'Warehouse view · read-only',
    updated: 'Updated 28 Jul 2026, 06:00 UTC',
    snippet:
      'Materialised from fct_revenue nightly. EMEA / enterprise segment, recognised revenue.',
    rows: [
      { k: 'EMEA enterprise renewals (Q2)', v: '$4.10M' },
      { k: 'EMEA enterprise renewals (Q3)', v: '$2.95M' },
      { k: 'Change QoQ', v: '−28.0%' },
    ],
  },
  {
    id: 2,
    title: 'Renewals tracker (CSV)',
    type: 'Export · owned by RevOps',
    updated: 'Updated 14 Jul 2026, 09:12 UTC',
    snippet:
      'account_id,region,segment,renewal_status,moved_quarter\nEMEA-0442,EMEA,ENT,in_negotiation,Q4',
    rows: [
      { k: 'Renewals pushed to Q4', v: '12 accounts' },
      { k: 'Status "in negotiation"', v: '4 accounts' },
      { k: 'Closed lost', v: '3 accounts' },
    ],
  },
  {
    id: 3,
    title: 'Q3 finance commentary (doc)',
    type: 'Finance narrative · signed off',
    updated: 'Updated 22 Jul 2026, 15:40 UTC',
    snippet:
      '"New-business bookings held flat QoQ; the Q3 shortfall is a renewals-timing effect, not demand."',
    rows: [
      { k: 'New-business bookings', v: 'Flat QoQ (+0.4%)' },
      { k: 'Expansion revenue', v: '+3.1% QoQ' },
      { k: 'Net revenue retention', v: '104%' },
    ],
  },
]

const WHY: Record<number, string> = {
  1: 'Compared recognised renewal revenue for the EMEA enterprise segment in Q3 against Q2 in the warehouse rollup; the −28% is the raw QoQ delta.',
  2: 'Counted accounts in the renewals tracker whose renewal quarter moved from Q3 to Q4. In-negotiation deals were included in that count.',
  3: 'Checked new-business bookings in the finance commentary — flat QoQ — which rules out demand as the driver and points to renewal timing.',
}

const PIPELINE = [
  { key: 'annotation', label: 'Analysing the annotation' },
  { key: 'retrieve', label: 'Retrieving sources you can access' },
  { key: 'figures', label: 'Checking the figures' },
  { key: 'draft', label: 'Drafting the explanation' },
] as const

type QKey = 'Q1' | 'Q2' | 'Q3' | 'Q4'

// Quarter-appropriate mock figures. Each holds base + corrected values
// (corrected = the 4 in-negotiation renewals counted as open, not churned).
const SCENARIOS: Record<
  QKey,
  { qoq: string; qoqCorr: string; renewal: string; renewalCorr: string; pushed: string; pushedCorr: string }
> = {
  Q1: { qoq: '5%', qoqCorr: '3%', renewal: '14%', renewalCorr: '10%', pushed: '6', pushedCorr: '4' },
  Q2: { qoq: '3%', qoqCorr: '2%', renewal: '9%', renewalCorr: '6%', pushed: '4', pushedCorr: '3' },
  Q3: { qoq: '12%', qoqCorr: '9%', renewal: '28%', renewalCorr: '21%', pushed: '12', pushedCorr: '8' },
  Q4: { qoq: '7%', qoqCorr: '5%', renewal: '18%', renewalCorr: '13%', pushed: '9', pushedCorr: '6' },
}

/* -------------------------------------------------------------- labels --- */

const LABEL = {
  evidence: { text: 'Evidence', color: 'var(--evidence)', bg: 'var(--evidence-soft)' },
  assumption: { text: 'Assumption', color: 'var(--assumption)', bg: 'var(--assumption-soft)' },
  unknown: { text: 'Unknown', color: 'var(--unknown)', bg: 'var(--unknown-soft)' },
} as const

/* What the answer actually renders: one Evidence block grounded in the sources
   the analyst can access, one Assumption block, one Unknown block. The trust
   meter counts these — it does not keep its own numbers. */
const ANSWER_BLOCKS = {
  evidence: SOURCES.length,
  assumption: 1,
  unknown: 1,
} as const

/* One live line describing what the agent is doing / about to do / just did.
   Derived entirely from the pipeline state that already drives <Working>. */
function agentStatus(
  phase: Phase,
  step: number,
  sourceCount: number,
  correcting: boolean,
): string {
  if (phase === 'idle') return 'Waiting for a question.'
  if (phase === 'answer') return 'Done — your move.'
  const p = PIPELINE[Math.max(0, Math.min(step, PIPELINE.length - 1))]
  if (p.key === 'retrieve') return `Retrieving ${sourceCount} sources you can access…`
  if (p.key === 'draft') return correcting ? 'Redrafting with your correction…' : 'Drafting…'
  return `${p.label}…`
}

function turnLabel(phase: Phase): string {
  if (phase === 'working') return 'Agent working'
  if (phase === 'answer') return 'Waiting for you'
  return 'Ready when you are'
}

/* --------------------------------------------------------- small parts --- */

function Tag({ kind }: { kind: keyof typeof LABEL }) {
  const l = LABEL[kind]
  return (
    <span
      className="tnum inline-flex items-center gap-1.5 r-token px-2 py-0.5 uppercase tracking-wide semi-bold-text-xs"
      style={{ color: l.color, background: l.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
      {l.text}
    </span>
  )
}

function Cite({ n, onClick, active }: { n: number; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className="tnum ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center r-token px-1 align-middle transition-colors semi-bold-text-xs"
      style={{
        color: active ? 'var(--white)' : 'var(--accent)',
        background: active ? 'var(--accent)' : 'var(--accent-soft)',
      }}
      aria-label={`Show source ${n}`}
    >
      {n}
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className="transition-transform duration-200"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UpdatedBadge() {
  return (
    <span
      className="rise inline-flex items-center gap-1 r-token px-1.5 py-0.5 uppercase tracking-wide bold-text-xs"
      style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Updated
    </span>
  )
}

function Block({
  kind,
  meta,
  updated = false,
  children,
  defaultOpen = true,
}: {
  kind: keyof typeof LABEL
  meta?: string
  updated?: boolean
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className="rise r-token border"
      style={{ background: 'var(--card)', borderColor: updated ? 'var(--accent)' : 'var(--hairline)' }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5"
      >
        <span className="flex items-center gap-2">
          <Tag kind={kind} />
          {meta && (
            <span className="tnum regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
              {meta}
            </span>
          )}
          {updated && <UpdatedBadge />}
        </span>
        <span style={{ color: 'var(--ink-soft)' }}>
          <Chevron open={open} />
        </span>
      </button>
      {open && <div className="px-3.5 pb-3.5 pt-0.5 leading-relaxed regular-text-sm">{children}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- chart --- */

function Chart({
  hover,
  setHover,
  onExplain,
}: {
  hover: boolean
  setHover: (v: boolean) => void
  onExplain: () => void
}) {
  const W = 620
  const H = 300
  const padL = 46
  const padB = 34
  const padT = 16
  const max = 11
  const plotH = H - padB - padT
  const plotW = W - padL - 16
  const bw = 58
  const gap = (plotW - bw * REVENUE.length) / (REVENUE.length - 1)

  const x = (i: number) => padL + i * (bw + gap)
  const y = (v: number) => padT + plotH * (1 - v / max)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="FY revenue by quarter">
      {/* gridlines */}
      {[0, 3, 6, 9].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - 16} y1={y(g)} y2={y(g)} stroke="var(--hairline)" strokeWidth="1" />
          <text x={padL - 10} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--ink-soft)" className="tnum">
            ${g}M
          </text>
        </g>
      ))}
      {REVENUE.map((q, i) => {
        const isQ3 = q.label === 'Q3'
        const top = y(q.value)
        const h = H - padB - top
        return (
          <g key={q.label}>
            <rect
              x={x(i)}
              y={top}
              width={bw}
              height={h}
              rx="5"
              fill={isQ3 ? (hover ? 'var(--accent)' : 'var(--chart-dip)') : q.projected ? 'var(--chart-bar-projected)' : 'var(--chart-bar)'}
              stroke={q.projected ? 'var(--chart-bar-projected-stroke)' : 'none'}
              strokeDasharray={q.projected ? '4 3' : undefined}
              className="cursor-pointer transition-colors duration-200"
              onMouseEnter={isQ3 ? () => setHover(true) : undefined}
              onMouseLeave={isQ3 ? () => setHover(false) : undefined}
              onClick={isQ3 ? onExplain : undefined}
            />
            <text x={x(i) + bw / 2} y={H - padB + 18} textAnchor="middle" fontSize="12" fill="var(--ink-soft)">
              {q.label}
            </text>
            <text
              x={x(i) + bw / 2}
              y={top - 8}
              textAnchor="middle"
              fontSize="12"
              fontWeight={isQ3 ? 700 : 500}
              fill={isQ3 ? 'var(--ink)' : 'var(--ink-soft)'}
              className="tnum"
            >
              ${q.value.toFixed(2)}M
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* --------------------------------------------------------------- panel --- */

type Phase = 'idle' | 'working' | 'answer'

export default function App() {
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])
  const [step, setStep] = useState(-1) // index of currently running pipeline step
  const [sourceCount, setSourceCount] = useState(0)
  const [corrected, setCorrected] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [activeCite, setActiveCite] = useState<number | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [quarter, setQuarter] = useState<QKey>('Q3')
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  const runPipeline = (asCorrection: boolean) => {
    clearTimers()
    setActiveCite(null)
    setCorrecting(asCorrection)
    setPhase('working')
    setStep(0)
    setSourceCount(0)

    const stepMs = asCorrection ? 460 : 700
    PIPELINE.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => setStep(i), i * stepMs),
      )
    })
    // source counter ticks during "retrieve" step
    ;[1, 2, 3].forEach((c, i) => {
      timers.current.push(
        window.setTimeout(() => setSourceCount(c), stepMs * 1 + 140 + i * 150),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        setStep(PIPELINE.length)
        setPhase('answer')
        if (asCorrection) setCorrected(true)
      }, PIPELINE.length * stepMs + 260),
    )
  }

  const explain = () => {
    setOpen(true)
    setCorrected(false)
    setQuarter('Q3')
    runPipeline(false)
  }

  useEffect(() => () => clearTimers(), [])

  const sc = SCENARIOS[quarter]
  const summary = corrected
    ? `${quarter} revenue fell ${sc.qoqCorr} QoQ once the 4 renewals still in negotiation are counted as open, not churned. The drop is still EMEA-enterprise-led, but shallower than first reported.`
    : `${quarter} revenue fell ${sc.qoq} QoQ. The drop is concentrated in the EMEA enterprise segment, mostly from delayed renewals.`

  const renewalDrop = corrected ? sc.renewalCorr : sc.renewal
  const pushed = corrected ? sc.pushedCorr : sc.pushed

  const resetDemo = () => {
    clearTimers()
    setOpen(false)
    setPhase('idle')
    setStep(-1)
    setSourceCount(0)
    setCorrected(false)
    setCorrecting(false)
    setActiveCite(null)
    setShareOpen(false)
    setToast(false)
    setQuarter('Q3')
  }

  const runQuarter = (q: QKey) => {
    setQuarter(q)
    setCorrected(false)
    runPipeline(false)
  }

  return (
    <div className="flex h-screen min-w-[1200px] flex-col" style={{ background: 'var(--canvas)' }}>
      {/* MARKER-MAKE-KIT-INVOKED */}
      {/* top bar */}
      <header
        className="flex shrink-0 items-center justify-between border-b px-6"
        style={{ height: 56, borderColor: 'var(--hairline)', background: 'var(--card)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-[7px] bold-text-sm"
            style={{ background: 'var(--accent)', color: 'var(--white)' }}
          >
            t
          </div>
          <span className="display tracking-tight semi-bold-text-sm">Tomoro</span>
          <span style={{ color: 'var(--hairline)' }}>/</span>
          <span className="regular-text-sm" style={{ color: 'var(--ink-soft)' }}>
            FY26 Revenue
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetDemo}
            className="flex items-center gap-1.5 r-token border px-2.5 py-1.5 transition-colors hover-tint-subtle medium-text-xs"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reset demo
          </button>

          {/* Theme toggle — Light / Dark */}
          <button
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center gap-1.5 r-token border px-2.5 py-1.5 transition-colors hover-tint-subtle medium-text-xs"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
          >
            {darkMode ? (
              /* Sun icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
              </svg>
            ) : (
              /* Moon icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {darkMode ? 'Light' : 'Dark'}
          </button>

          <div
            className="flex h-7 w-7 items-center justify-center rounded-full semi-bold-text-xs"
            style={{ background: 'var(--avatar)', color: 'var(--white)' }}
          >
            AM
          </div>
        </div>
      </header>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        {/* dashboard */}
        <main className="scroll-quiet min-w-0 flex-1 overflow-auto px-8 py-8 lg:px-12">
          <div className="mx-auto max-w-3xl">
            <div className="mb-1 flex items-baseline justify-between">
              <div>
                <h1 className="display tracking-tight semi-bold-text-lg">Revenue by quarter</h1>
                <p className="mt-0.5 regular-text-sm" style={{ color: 'var(--ink-soft)' }}>
                  Fiscal year 2026 · consolidated · USD
                </p>
              </div>
              <div className="tnum text-right">
                <div className="semi-bold-text-xl">$35.30M</div>
                <div className="regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
                  FY to date
                </div>
              </div>
            </div>

            <div
              className="relative mt-5 r-token border p-5"
              style={{ borderColor: 'var(--hairline)', background: 'var(--card)' }}
            >
              <Chart hover={hover} setHover={setHover} onExplain={explain} />

              {/* annotation chip over Q3 */}
              <button
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onClick={explain}
                className="tnum absolute flex items-center gap-2 r-token border px-3 py-2 text-left transition-all duration-200"
                style={{
                  left: '52%',
                  top: 96,
                  background: 'var(--card)',
                  borderColor: hover ? 'var(--accent)' : 'var(--hairline)',
                  boxShadow: hover
                    ? 'var(--shadow-card-hover)'
                    : 'var(--shadow-card)',
                  transform: hover ? 'translateY(-1px)' : 'none',
                }}
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
                <span>
                  <span className="block semi-bold-text-xs" style={{ color: 'var(--ink)' }}>
                    Revenue dipped in Q3
                  </span>
                  <span className="regular-text-xs" style={{ color: 'var(--restricted)' }}>
                    −12% QoQ
                  </span>
                </span>
                <span
                  className="ml-1 r-token px-2 py-1 semi-bold-text-xs"
                  style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                >
                  Explain this
                </span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { k: 'QoQ growth', v: '−12.0%', tone: 'var(--restricted)' },
                { k: 'YoY growth', v: '+6.2%', tone: 'var(--ink)' },
                { k: 'Net retention', v: '104%', tone: 'var(--ink)' },
              ].map((m) => (
                <div
                  key={m.k}
                  className="r-token border p-3.5"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--card)' }}
                >
                  <div className="regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
                    {m.k}
                  </div>
                  <div className="tnum mt-1 semi-bold-text-lg" style={{ color: m.tone }}>
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* sidekick panel */}
        <aside
          className="shrink-0 overflow-hidden border-l transition-all duration-300 ease-out"
          style={{
            width: open ? 440 : 0,
            borderColor: 'var(--hairline)',
            background: 'var(--card)',
          }}
        >
          <div className="relative flex h-full w-[440px] flex-col overflow-hidden">
            <SidekickHeader
              onClose={() => setOpen(false)}
              canShare={phase === 'answer'}
              onShare={() => setShareOpen(true)}
            />
            <SharedGoalBanner
              phase={phase}
              step={step}
              corrected={corrected}
              status={agentStatus(phase, step, sourceCount, correcting)}
            />
            <div className="scroll-quiet min-h-0 flex-1 overflow-auto px-4 py-4">
              {phase === 'working' && (
                <Working step={step} sourceCount={sourceCount} correcting={correcting} />
              )}
              {phase === 'answer' && (
                <Answer
                  key={`${quarter}-${corrected}`}
                  quarter={quarter}
                  corrected={corrected}
                  summary={summary}
                  renewalDrop={renewalDrop}
                  pushed={pushed}
                  activeCite={activeCite}
                  onCite={setActiveCite}
                  onCorrect={() => runPipeline(true)}
                  onRunQuarter={runQuarter}
                />
              )}
            </div>

            {/* source preview drawer — slides over the panel */}
            <SourceDrawer
              source={SOURCES.find((s) => s.id === activeCite) ?? null}
              onBack={() => setActiveCite(null)}
            />
          </div>
        </aside>
      </div>

      {shareOpen && (
        <ShareModal
          summary={summary}
          onClose={() => setShareOpen(false)}
          onShared={() => {
            setShareOpen(false)
            setToast(true)
            window.setTimeout(() => setToast(false), 3200)
          }}
        />
      )}

      <Toast show={toast} />
    </div>
  )
}

/* ------------------------------------------------------- panel pieces --- */

function SidekickHeader({
  onClose,
  canShare,
  onShare,
}: {
  onClose: () => void
  canShare: boolean
  onShare: () => void
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b px-4"
      style={{ height: 56, borderColor: 'var(--hairline)' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-[7px]"
          style={{ background: 'var(--accent-soft)' }}
        >
          <span className="h-2 w-2 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
        </div>
        <div>
          <div className="leading-none semi-bold-text-sm">Research sidekick</div>
          <div className="mt-1 leading-none regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
            Show your working
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {canShare && (
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 r-token border px-2.5 py-1.5 transition-colors hover-tint-subtle semi-bold-text-xs"
            style={{ borderColor: 'var(--hairline)', color: 'var(--accent)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 15V3M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Share / export
          </button>
        )}
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center r-token transition-colors hover-tint"
          aria-label="Collapse panel"
          style={{ color: 'var(--ink-soft)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 6l6 6-6 6M5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* Persistent strip: the goal both parties are working towards, who is holding
   the turn, how far the work has got, and what the agent is doing right now.
   Everything here is derived from existing pipeline state. */
function SharedGoalBanner({
  phase,
  step,
  corrected,
  status,
}: {
  phase: Phase
  step: number
  corrected: boolean
  status: string
}) {
  // gather → cite → draft fills to 80%; the analyst's correction closes the last 20%
  const pct =
    phase === 'idle'
      ? 0
      : phase === 'working'
        ? Math.round(((Math.min(step, PIPELINE.length - 1) + 1) / PIPELINE.length) * 80)
        : corrected
          ? 100
          : 80
  const turn = turnLabel(phase)
  const working = phase === 'working'

  return (
    <div
      className="shrink-0 border-b px-4 py-2.5"
      style={{ borderColor: 'var(--hairline)', background: 'var(--accent-faint)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full ring-2 semi-bold-text-xs"
              style={{
                background: 'var(--avatar)',
                color: 'var(--white)',
                // @ts-expect-error CSS custom property for the Tailwind ring colour
                '--tw-ring-color': 'var(--card)',
              }}
            >
              AR
            </span>
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full ring-2"
              style={{
                background: 'var(--accent)',
                // @ts-expect-error CSS custom property for the Tailwind ring colour
                '--tw-ring-color': 'var(--card)',
              }}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full${working ? ' pulse-dot' : ''}`}
                style={{ background: 'var(--white)' }}
              />
            </span>
          </span>
          <span className="truncate medium-text-xs" style={{ color: 'var(--ink)' }}>
            Shared goal: an answer you can defend.
          </span>
        </div>

        {/* turn-taking cue — remounts on handoff so it cross-fades */}
        <span
          key={turn}
          className="swap-in flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 semi-bold-text-xs"
          style={{
            background: working ? 'var(--accent-soft)' : 'var(--assumption-soft)',
            color: working ? 'var(--accent)' : 'var(--assumption)',
          }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full${working ? ' pulse-dot' : ''}`}
            style={{ background: 'currentColor' }}
          />
          {turn}
        </span>
      </div>

      <div
        className="mt-2 h-[2px] overflow-hidden rounded-full"
        style={{ background: 'var(--hairline)' }}
        role="progressbar"
        aria-label="Progress towards a defensible answer"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="motion-move h-full rounded-full"
          style={{ width: `${pct}%`, background: 'var(--accent)' }}
        />
      </div>

      {/* agent status line — the panel's polite live region */}
      <div className="mt-1.5 leading-none" aria-live="polite" aria-atomic="true">
        <span
          key={status}
          className="swap-in inline-block regular-text-xs"
          style={{ color: 'var(--ink-soft)' }}
        >
          {status}
        </span>
      </div>
    </div>
  )
}

function Working({
  step,
  sourceCount,
  correcting,
}: {
  step: number
  sourceCount: number
  correcting: boolean
}) {
  const pct = Math.min(100, Math.round(((step + 0.5) / PIPELINE.length) * 100))
  return (
    <div>
      {correcting && (
        <div
          className="mb-3 flex items-center gap-2 semi-bold-text-sm"
          style={{ color: 'var(--accent)' }}
        >
          <span className="h-2 w-2 rounded-full pulse-dot" style={{ background: 'var(--accent)', color: 'var(--white)' }} />
          Re-checking with your correction…
        </div>
      )}
      <div className="mb-4 h-1 overflow-hidden rounded-full" style={{ background: 'var(--hairline)' }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: 'var(--accent)' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        {PIPELINE.map((p, i) => {
          const done = step > i
          const active = step === i
          const isDraft = p.key === 'draft'
          return (
            <div key={p.key} className="flex items-center gap-3 r-token px-2 py-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : active ? (
                  <span
                    className="h-3.5 w-3.5 rounded-full border-2 border-current pulse-dot"
                    style={{ color: 'var(--accent)', borderRightColor: 'transparent' }}
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--hairline)' }} />
                )}
              </span>

              <span
                className="flex-1 regular-text-sm"
                style={{ color: done || active ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: active ? 600 : 400 }}
              >
                {p.label}
                {p.key === 'retrieve' && (done || active) && (
                  <span className="tnum ml-1.5" style={{ color: 'var(--accent)' }}>
                    {sourceCount}/3
                  </span>
                )}
                {active && '…'}
              </span>

              {isDraft && active && <span className="h-4 w-20 rounded shimmer" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SourceDrawer({ source, onBack }: { source: Source | null; onBack: () => void }) {
  const open = source !== null
  // keep last source mounted during the slide-out so content doesn't flash away
  const shownRef = useRef<Source | null>(source)
  if (source) shownRef.current = source
  const s = shownRef.current

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col transition-transform duration-[250ms] ease-out"
      style={{ background: 'var(--card)', transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      aria-hidden={!open}
    >
      {/* drawer header with back control */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3"
        style={{ height: 56, borderColor: 'var(--hairline)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 r-token px-2 py-1.5 transition-colors hover-tint medium-text-sm"
          style={{ color: 'var(--accent)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to answer
        </button>
        <span className="ml-auto uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--ink-soft)' }}>
          Source preview
        </span>
      </div>

      {s && (
        <div className="scroll-quiet min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="flex items-start gap-2.5">
            <span
              className="tnum flex h-6 w-6 shrink-0 items-center justify-center r-token bold-text-xs"
              style={{ background: 'var(--accent)', color: 'var(--white)' }}
            >
              {s.id}
            </span>
            <div>
              <div className="leading-snug semi-bold-text-base">{s.title}</div>
              <div className="mt-0.5 regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
                {s.type}
              </div>
            </div>
          </div>

          <div className="tnum mt-3 regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
            {s.updated}
          </div>

          {/* snippet */}
          <div
            className="tnum mt-3 whitespace-pre-wrap r-token border px-3 py-2.5 leading-relaxed regular-text-xs"
            style={{ borderColor: 'var(--hairline)', background: 'var(--canvas)', color: 'var(--ink)' }}
          >
            {s.snippet}
          </div>

          {/* mini data table */}
          <div className="mt-3 uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--ink-soft)' }}>
            Referenced values
          </div>
          <div className="mt-1.5 overflow-hidden r-token border" style={{ borderColor: 'var(--hairline)' }}>
            {s.rows.map((r, i) => (
              <div
                key={r.k}
                className="flex items-center justify-between px-3 py-2"
                style={{ borderTop: i ? '1px solid var(--hairline)' : 'none' }}
              >
                <span className="regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {r.k}
                </span>
                <span className="tnum semi-bold-text-xs">{r.v}</span>
              </div>
            ))}
          </div>

          <button
            className="mt-4 flex w-full items-center justify-center gap-1.5 r-token px-3 py-2.5 transition-opacity hover:opacity-90 semi-bold-text-sm"
            style={{ background: 'var(--accent)', color: 'var(--white)' }}
          >
            Open source
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function WhyRow({
  n,
  active,
  onCite,
  children,
}: {
  n: number
  active: boolean
  onCite: (n: number) => void
  children: React.ReactNode
}) {
  const [why, setWhy] = useState(false)
  return (
    <li>
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1">
          {children}
          <Cite n={n} active={active} onClick={() => onCite(n)} />
        </span>
        <button
          onClick={() => setWhy((w) => !w)}
          className="tnum mt-0.5 shrink-0 r-token px-1.5 py-0.5 transition-colors semi-bold-text-xs"
          style={{
            color: why ? 'var(--white)' : 'var(--ink-soft)',
            background: why ? 'var(--ink-soft)' : 'var(--unknown-soft)',
          }}
        >
          Why?
        </button>
      </div>
      {why && (
        <p
          className="rise mt-1.5 border-l-2 pl-2.5 leading-relaxed regular-text-xs"
          style={{ borderColor: 'var(--evidence)', color: 'var(--ink-soft)' }}
        >
          {WHY[n]}
        </p>
      )}
    </li>
  )
}

function RestrictedRow() {
  const [requested, setRequested] = useState(false)
  return (
    <div
      className="flex items-center gap-2.5 r-token border px-3 py-2.5"
      style={{ borderColor: 'var(--hairline)', background: 'var(--unknown-soft)' }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center r-token"
        style={{ background: 'var(--restricted-soft)', color: 'var(--restricted)' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 medium-text-xs" style={{ color: 'var(--unknown)' }}>
          Salesforce — EMEA opportunities
        </div>
        <div className="uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--restricted)' }}>
          Restricted
        </div>
      </div>
      {requested ? (
        <span
          className="rise inline-flex shrink-0 items-center gap-1 semi-bold-text-xs"
          style={{ color: 'var(--accent)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Access requested
        </span>
      ) : (
        <button
          onClick={() => setRequested(true)}
          className="shrink-0 r-token border px-2.5 py-1.5 transition-colors hover-tint-subtle semi-bold-text-xs"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Request access
        </button>
      )}
    </div>
  )
}

/* Counts up to `target` when `run` is set; jumps straight there otherwise, and
   whenever the reader has asked for reduced motion. */
function useCountUp(target: number, run: boolean) {
  const [n, setN] = useState(run ? 0 : target)
  useEffect(() => {
    if (!run || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(target)
      return
    }
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setN(Math.min(i, target))
      if (i >= target) window.clearInterval(id)
    }, 90)
    return () => window.clearInterval(id)
  }, [target, run])
  return n
}

/* Qualitative grounding, counted from the blocks the answer actually renders.
   Deliberately no percentage — a made-up number would be the opposite of the
   point. The correction resolves the assumption, so the meter recalibrates. */
function TrustMeter({ corrected }: { corrected: boolean }) {
  const sources = useCountUp(ANSWER_BLOCKS.evidence, corrected)
  const filled = corrected ? 3 : 2
  return (
    <div
      tabIndex={0}
      className="mt-2 flex items-center gap-2"
      aria-label={`Grounded in ${ANSWER_BLOCKS.evidence} verified sources, ${ANSWER_BLOCKS.assumption} assumption${
        corrected ? ' resolved' : ''
      }, ${ANSWER_BLOCKS.unknown} unknown. Confidence ${corrected ? 'higher' : 'medium'}.`}
    >
      <span className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="motion-move h-1.5 w-4 rounded-full"
            style={{
              background: i < filled ? 'var(--accent)' : 'var(--hairline)',
              transitionDelay: `calc(${i} * var(--stagger))`,
            }}
          />
        ))}
      </span>
      <span className="tnum regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
        Grounded in {sources} verified sources · {ANSWER_BLOCKS.assumption} assumption
        {corrected && ' resolved'} · {ANSWER_BLOCKS.unknown} unknown
      </span>
    </div>
  )
}

function Answer({
  quarter,
  corrected,
  summary,
  renewalDrop,
  pushed,
  activeCite,
  onCite,
  onCorrect,
  onRunQuarter,
}: {
  quarter: QKey
  corrected: boolean
  summary: string
  renewalDrop: string
  pushed: string
  activeCite: number | null
  onCite: (n: number) => void
  onCorrect: () => void
  onRunQuarter: (q: QKey) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState('Renewals in negotiation aren’t churned')
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [saved, setSaved] = useState(false)
  const [qMenu, setQMenu] = useState(false)

  const submit = () => {
    setShowForm(false)
    onCorrect()
  }

  return (
    <div className="flex flex-col gap-3">
      {corrected && (
        <div
          className="rise flex items-center gap-2 r-token px-3 py-2 medium-text-xs"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Re-ran with your correction — figures updated.
        </div>
      )}

      {/* summary */}
      <div className="rise">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--ink-soft)' }}>
            Summary
          </span>
          {corrected && <UpdatedBadge />}
        </div>
        <p className="leading-relaxed regular-text-sm">{summary}</p>
      </div>

      {/* evidence */}
      <Block kind="evidence" meta="3 facts" updated={corrected}>
        <ul className="flex flex-col gap-2.5">
          <WhyRow n={1} active={activeCite === 1} onCite={onCite}>
            EMEA enterprise renewals fell <span className="tnum font-semibold">{renewalDrop}</span> vs prior quarter
          </WhyRow>
          <WhyRow n={2} active={activeCite === 2} onCite={onCite}>
            <span className="tnum font-semibold">{pushed}</span> accounts pushed renewal into Q4
          </WhyRow>
          <WhyRow n={3} active={activeCite === 3} onCite={onCite}>
            New-business bookings were <span className="font-semibold">flat</span>, not down
          </WhyRow>
        </ul>
      </Block>

      {/* assumption */}
      <Block kind="assumption" updated={corrected}>
        {!corrected ? (
          <>
            <p>
              Assumes the <span className="tnum font-semibold">4</span> renewals still &ldquo;in
              negotiation&rdquo; are treated as churned
              <Cite n={2} active={activeCite === 2} onClick={() => onCite(2)} />.
            </p>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="mt-2.5 inline-flex items-center gap-1.5 r-token border px-3 py-1.5 transition-colors semi-bold-text-xs"
                style={{ borderColor: 'var(--assumption)', color: 'var(--assumption)' }}
              >
                This doesn&rsquo;t hold
              </button>
            ) : (
              <div
                className="rise mt-2.5 r-token border p-2.5"
                style={{ borderColor: 'var(--assumption)', background: 'var(--assumption-faint)' }}
              >
                <label className="uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--assumption)' }}>
                  What&rsquo;s wrong with this assumption?
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="mt-1.5 w-full resize-none r-token border px-2.5 py-2 leading-snug outline-none focus:border-current regular-text-sm"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink)', background: 'var(--canvas)' }}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className="r-token px-2.5 py-1.5 transition-colors hover-tint medium-text-xs"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={!note.trim()}
                    className="tnum r-token px-3 py-1.5 transition-opacity disabled:opacity-40 semi-bold-text-xs"
                    style={{ background: 'var(--accent)', color: 'var(--white)' }}
                  >
                    Re-run with this
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="line-through" style={{ color: 'var(--unknown)' }}>
              Assumes the 4 renewals still &ldquo;in negotiation&rdquo; are treated as churned.
            </p>
            <p className="mt-1.5">
              The <span className="tnum font-semibold">4</span> in-negotiation renewals are counted as
              <span className="font-semibold"> open</span>, not churned
              <Cite n={2} active={activeCite === 2} onClick={() => onCite(2)} />.
            </p>
            <p className="mt-2 medium-text-xs" style={{ color: 'var(--accent)' }}>
              ✓ Applied your correction: &ldquo;{note.trim()}&rdquo;
            </p>
          </>
        )}
      </Block>

      {/* unknown */}
      <Block kind="unknown">
        <p>
          Can&rsquo;t confirm whether {quarter} discount changes affected deal size — that data isn&rsquo;t in
          your permitted scope.
        </p>
        <div className="mt-2.5">
          <RestrictedRow />
        </div>
      </Block>

      {/* next check */}
      <button
        className="rise flex items-center justify-between r-token border px-3.5 py-3 text-left transition-colors hover-tint-subtle"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <span>
          <span className="uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--accent)' }}>
            Suggested next check
          </span>
          <span className="mt-0.5 block medium-text-sm">
            Compare EMEA renewal cohort to APAC
          </span>
        </span>
        <span
          className="tnum shrink-0 r-token px-2.5 py-1.5 semi-bold-text-xs"
          style={{ background: 'var(--accent)', color: 'var(--white)' }}
        >
          Run check
        </span>
      </button>

      {/* repeatable + re-run controls */}
      <div className="rise flex items-center gap-2">
        <button
          onClick={() => setSaved(true)}
          disabled={saved}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap r-token border px-3 py-2 transition-colors hover-tint-subtle disabled:opacity-100 semi-bold-text-xs"
          style={{
            borderColor: saved ? 'var(--accent)' : 'var(--hairline)',
            color: 'var(--accent)',
            background: saved ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          {saved ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {saved ? 'Saved as repeatable check' : 'Save as repeatable check'}
        </button>

        <div className="relative">
          <button
            onClick={() => setQMenu((m) => !m)}
            className="flex items-center gap-1.5 r-token border px-3 py-2 transition-colors hover-tint-subtle semi-bold-text-xs"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink)' }}
          >
            Re-run
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="transition-transform duration-200"
              style={{ transform: qMenu ? 'rotate(180deg)' : 'none', color: 'var(--ink-soft)' }}
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {qMenu && (
            <div
              className="rise absolute right-0 bottom-full z-20 mb-1.5 w-44 overflow-hidden r-token border"
              style={{ background: 'var(--card)', borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-menu)' }}
            >
              <div
                className="border-b px-3 py-1.5 uppercase tracking-wide semi-bold-text-xs"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
              >
                Re-run on another quarter
              </div>
              {(['Q1', 'Q2', 'Q3', 'Q4'] as QKey[]).map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQMenu(false)
                    onRunQuarter(q)
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover-tint-subtle regular-text-sm"
                  style={{ color: q === quarter ? 'var(--accent)' : 'var(--ink)' }}
                >
                  <span className="tnum font-medium">{q} FY26</span>
                  {q === quarter && (
                    <span className="semi-bold-text-xs" style={{ color: 'var(--accent)' }}>
                      current
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* scope */}
      <div className="rise mt-1 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
        <div className="mb-2 uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--ink-soft)' }}>
          Sources in scope
        </div>
        <div className="flex flex-col gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => onCite(s.id)}
              className="flex items-center gap-2.5 r-token border px-3 py-2 text-left transition-colors hover-tint-subtle"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <span
                className="tnum flex h-5 w-5 shrink-0 items-center justify-center rounded bold-text-xs"
                style={{ background: 'var(--accent)', color: 'var(--white)' }}
              >
                {s.id}
              </span>
              <span className="min-w-0 flex-1 truncate medium-text-xs">{s.title}</span>
              <span className="shrink-0 regular-text-xs" style={{ color: 'var(--accent)' }}>
                Preview
              </span>
            </button>
          ))}
          <RestrictedRow />
        </div>
      </div>

      {/* footer */}
      <div
        className="rise mt-1 border-t pt-3 regular-text-xs"
        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
      >
        <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
          style={{
            background: corrected ? 'var(--accent-soft)' : 'var(--assumption-soft)',
            color: corrected ? 'var(--accent)' : 'var(--assumption)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: corrected ? 'var(--accent)' : 'var(--assumption)' }}
          />
          {corrected ? 'High confidence' : 'Medium confidence'}
        </span>
        <span className="tnum text-right">
          Based on 3 sources you can access · 1 restricted
        </span>
        </div>
        <TrustMeter corrected={corrected} />
      </div>

      {/* feedback */}
      <div className="mt-1 flex items-center gap-2.5">
        {vote === null ? (
          <>
            <span className="regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
              Was this useful?
            </span>
            <button
              onClick={() => setVote('up')}
              aria-label="Helpful"
              className="flex h-7 w-7 items-center justify-center r-token border transition-colors hover-tint"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M7 10v11M2 13v6a2 2 0 0 0 2 2h13.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3H14V4a2 2 0 0 0-2-2l-3 7v11" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setVote('down')}
              aria-label="Not helpful"
              className="flex h-7 w-7 items-center justify-center r-token border transition-colors hover-tint"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M17 14V3M22 11V5a2 2 0 0 0-2-2H6.7a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 5.3 16H10v4a2 2 0 0 0 2 2l3-7V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        ) : (
          <p className="rise medium-text-xs" style={{ color: 'var(--accent)' }}>
            {vote === 'up'
              ? 'Thanks — noted this explanation as helpful.'
              : 'Thanks — flagged for review. I’ll tighten the next pass.'}
          </p>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- share flow --- */

// Match currency ($9.6M) and percentage (−12%, 28%) figures to flag as sensitive.
const FIGURE_RE = /(\$[\d.]+M|[−-]?\d+(?:\.\d+)?%)/g

function ShareModal({
  summary,
  onClose,
  onShared,
}: {
  summary: string
  onClose: () => void
  onShared: () => void
}) {
  const [text, setText] = useState(summary)
  const [reviewed, setReviewed] = useState(false)
  const figures = Array.from(new Set(text.match(FIGURE_RE) ?? []))

  const share = () => {
    if (!reviewed) return
    // review-gated: copy happens only here, never automatically
    navigator.clipboard?.writeText(text).catch(() => {})
    onShared()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="rise w-full max-w-[460px] overflow-hidden r-token"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <div className="display semi-bold-text-base">Review before sharing</div>
            <div className="mt-0.5 regular-text-xs" style={{ color: 'var(--ink-soft)' }}>
              Nothing is exported until you confirm.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center r-token transition-colors hover-tint"
            style={{ color: 'var(--ink-soft)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="uppercase tracking-wide semi-bold-text-xs" style={{ color: 'var(--ink-soft)' }}>
            Summary to share — edit as needed
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="tnum mt-1.5 w-full resize-none r-token border px-3 py-2.5 leading-relaxed outline-none focus:border-current regular-text-sm"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink)', background: 'var(--canvas)' }}
          />

          {/* sensitive figures notice */}
          {figures.length > 0 && (
            <div
              className="mt-3 r-token border px-3 py-2.5"
              style={{ borderColor: 'var(--assumption)', background: 'var(--assumption-faint)' }}
            >
              <div className="flex items-center gap-1.5 semi-bold-text-xs" style={{ color: 'var(--assumption)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Review before sharing — {figures.length} sensitive figure{figures.length > 1 ? 's' : ''}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {figures.map((f) => (
                  <span
                    key={f}
                    className="tnum r-token px-2 py-0.5 semi-bold-text-xs"
                    style={{ background: 'var(--assumption-soft)', color: 'var(--assumption)' }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* required review checkbox */}
          <button
            onClick={() => setReviewed((r) => !r)}
            className="mt-3 flex w-full items-center gap-2.5 r-token border px-3 py-2.5 text-left transition-colors"
            style={{
              borderColor: reviewed ? 'var(--accent)' : 'var(--hairline)',
              background: reviewed ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <span
              className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded"
              style={{
                width: 18,
                height: 18,
                background: reviewed ? 'var(--accent)' : 'var(--card)',
                border: `1.5px solid ${reviewed ? 'var(--accent)' : 'var(--control-border)'}`,
              }}
            >
              {reviewed && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--white)" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="medium-text-sm">I&rsquo;ve reviewed this and the figures are OK to share</span>
          </button>
        </div>

        {/* footer actions */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: 'var(--hairline)' }}>
          <button
            onClick={onClose}
            className="r-token px-3.5 py-2 transition-colors hover-tint medium-text-sm"
            style={{ color: 'var(--ink-soft)' }}
          >
            Cancel
          </button>
          <button
            onClick={share}
            disabled={!reviewed}
            className="flex items-center gap-1.5 r-token px-3.5 py-2 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 semi-bold-text-sm"
            style={{ background: 'var(--accent)', color: 'var(--white)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
            </svg>
            Copy / share
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ show }: { show: boolean }) {
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200"
      style={{ opacity: show ? 1 : 0, transform: `translate(-50%, ${show ? 0 : 8}px)` }}
      aria-live="polite"
    >
      <div
        className="flex items-center gap-2 r-token px-4 py-2.5 semi-bold-text-sm"
        style={{ background: 'var(--toast)', color: 'var(--white)', boxShadow: 'var(--shadow-toast)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Summary copied — ready to share
      </div>
    </div>
  )
}

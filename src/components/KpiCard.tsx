import clsx from 'clsx'

function formatValue(v: string | number): string {
  if (typeof v === 'number') return Math.round(v).toLocaleString()
  return v
}

export function KpiCard(props: {
  title: string
  value: string | number
  subtitle?: string
  deltaLabel?: string
  deltaValue?: string
  deltaIsText?: boolean
}) {
  const numericDelta =
    props.deltaIsText || !props.deltaValue ? null : Number.parseFloat(props.deltaValue.replace('%', ''))

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
      </div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{formatValue(props.value)}</div>
      {props.subtitle ? <div className="mt-1 text-xs text-slate-500">{props.subtitle}</div> : null}

      {props.deltaLabel && props.deltaValue ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <div className="text-slate-500">{props.deltaLabel}</div>
          <div
            className={clsx(
              'font-semibold',
              props.deltaIsText
                ? 'text-slate-700'
                : numericDelta === null
                  ? 'text-slate-700'
                  : numericDelta >= 100
                    ? 'text-emerald-700'
                    : numericDelta >= 90
                      ? 'text-amber-700'
                      : 'text-rose-700',
            )}
          >
            {props.deltaValue}
          </div>
        </div>
      ) : null}
    </div>
  )
}


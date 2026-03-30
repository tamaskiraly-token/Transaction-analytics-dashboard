import clsx from 'clsx'

export function ViewModeSwitch(props: {
  value: 'month' | 'year'
  onChange: (value: 'month' | 'year') => void
}) {
  return (
    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
      <button
        type="button"
        className={clsx(
          'h-8 rounded-lg px-3 text-xs font-semibold transition',
          props.value === 'month' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white',
        )}
        onClick={() => props.onChange('month')}
      >
        In-month
      </button>
      <button
        type="button"
        className={clsx(
          'h-8 rounded-lg px-3 text-xs font-semibold transition',
          props.value === 'year' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white',
        )}
        onClick={() => props.onChange('year')}
      >
        In-year
      </button>
    </div>
  )
}


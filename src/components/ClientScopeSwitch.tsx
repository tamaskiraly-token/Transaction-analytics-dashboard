import clsx from 'clsx'

export function ClientScopeSwitch(props: {
  value: 'company' | 'client'
  onChange: (value: 'company' | 'client') => void
}) {
  return (
    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
      <button
        type="button"
        className={clsx(
          'h-8 rounded-lg px-3 text-xs font-semibold transition',
          props.value === 'company'
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-600 hover:bg-white',
        )}
        onClick={() => props.onChange('company')}
      >
        Company
      </button>
      <button
        type="button"
        className={clsx(
          'h-8 rounded-lg px-3 text-xs font-semibold transition',
          props.value === 'client'
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-600 hover:bg-white',
        )}
        onClick={() => props.onChange('client')}
      >
        Per client
      </button>
    </div>
  )
}


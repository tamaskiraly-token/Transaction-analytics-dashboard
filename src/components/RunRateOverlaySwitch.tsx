import clsx from 'clsx'

export function RunRateOverlaySwitch(props: {
  value: boolean
  onChange: (value: boolean) => void
  label?: string
}) {
  return (
    <button type="button" onClick={() => props.onChange(!props.value)} className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-600">{props.label ?? 'Run-rate bars'}</span>
      <span
        className={clsx(
          'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition',
          props.value ? 'border-slate-900 bg-slate-900' : 'border-slate-200 bg-slate-100',
        )}
        role="switch"
        aria-checked={props.value}
      >
        <span
          className={clsx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition',
            props.value ? 'translate-x-5' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}


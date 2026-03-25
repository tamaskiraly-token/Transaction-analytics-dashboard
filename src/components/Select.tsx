import clsx from 'clsx'

export type SelectOption = { value: string; label: string }

export function Select(props: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <select
      className={clsx(
        'h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none',
        'focus:border-slate-300 focus:ring-2 focus:ring-slate-200',
        props.disabled && 'cursor-not-allowed bg-slate-50 text-slate-400',
      )}
      disabled={props.disabled}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}


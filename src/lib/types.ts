export type Client = {
  id: string
  name: string
  status?: 'existing' | 'new'
}

export type DailyClientTxn = {
  dateIso: string // yyyy-MM-dd
  clientId: string
  txns: number
}

export type TxnDataset = {
  clients: Client[]
  daily: DailyClientTxn[]
  /**
   * Dates that should be treated as bank holidays for forecasting purposes.
   * ISO date only: yyyy-MM-dd
   */
  bankHolidayDates: string[]
  /**
   * Optional historical daily data used to derive intra-month seasonality multipliers.
   * If missing, forecasting still works (just without seasonal adjustment).
   */
  historicalDaily?: DailyClientTxn[]
}

export type DayType = 'weekday' | 'weekend' | 'holiday'


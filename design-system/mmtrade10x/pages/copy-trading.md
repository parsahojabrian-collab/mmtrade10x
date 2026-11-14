# Copy-trading and trading analytics override

- Account overview uses verified balance/equity and clear period context.
- Use candlesticks only when OHLC data exists; use line chart for portfolio value over time.
- PnL: show signed amount, percentage, period and risk note; do not imply guaranteed returns.
- Bullish/bearish states use label + symbol + color; include table fallback.
- Keep broker/account identifiers LTR and copyable.

# makefun-btc-race-bot

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/Wahyudifarid/makefun-btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/Wahyudifarid/makefun-btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

A burst + V-bounce trading bot for the make.fun BTC 24h live race. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute Orca bars, long only, one full-size position at a time: it enters on a sharp upward burst (5-bar return over +100 bps), sustained momentum (15-bar return over +150 bps), or a V-bounce after a sharp drop (60-bar return under -200 bps that just turned up), and exits on a +200 bps take profit, an 80 bps trailing stop, or a 90-bar max hold. Backtested on the published dev window with the harness's exact fill model: net +$30.48 on $1,000, 3 trades, max drawdown 1.6%.

## Run it

```sh
node cli/makefun.mjs grade-local --kit . --bot /path/to/makefun-btc-race-bot --driver docker
```

(Run from inside the unpacked competition kit directory.)

---

<sub>Entered on [make.fun](https://make.fun/?ref=5p2p2a05&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards</sub>

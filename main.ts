// BTC 24h race bot (make.fun btc-race-24h-20261115-0828).
//
// Strategy: burst + V-bounce, long only, one position, full size.
//   Entry (flat only), decided on a bar's close, filled at the next open:
//     - burst: 5-bar log return > +100 bps (a sharp upward burst keeps running), or
//     - momentum: 15-bar log return > +150 bps, or
//     - V-bounce: 60-bar log return < -200 bps AND 5-bar log return > +30 bps
//       (a sharp hourly drop that just turned up), or
//     - recovery: 30-bar log return < -150 bps AND 5-bar log return > +50 bps.
//   Exit (in position), same timing:
//     - take profit at +200 bps over the fill price, or
//     - trailing stop 80 bps below the highest close since entry, or
//     - max hold 90 bars.
//   Chase guard: burst / momentum entries are skipped when the 5-bar
//   return is above +400 bps (a vertical blow-off top, not a burst).
//   No new entries in the last 30 bars (a late fill would be flattened at the
//   last close with no time to move).
//
// Why this shape: on the dev window BTC fell 4% over 24h with one sharp
// V (about -2% then +2.8% in two hours). Trend-following (EMA cross) and
// RSI mean-reversion both lost money there after the ~26-43 bps round-trip
// cost (4 bps fee + 2 bps slippage + pool impact each way). The only
// repeatable edge in the data is that extreme short-term moves persist:
// a 5-minute return over +100 bps and a post-drop turn both preceded
// further upside, while ordinary 15-60 minute momentum did not survive
// costs. Backtested on the dev window with the harness's exact fill model:
// net +$30.48 on $1,000, 3 trades, max drawdown 1.6%. The number is
// driven by one intraday V, so treat it as a gate pass, not a promise:
// the exits (trailing stop, take profit, max hold) are what keep a bad
// day's loss to about 1% per trade.
//
// Deterministic: no clock, no randomness, no environment; every decision
// is a pure function of the closes seen so far. Uses only the standard
// library plus the kit's bars shim (vendor/makefun-bars.ts, byte-identical).

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** 5-bar log return above this (bps) is a burst worth chasing. */
const BURST_BPS = 100;
/** 15-bar log return above this (bps) is sustained momentum. */
const MOM15_BPS = 150;
/** 60-bar log return below this (bps) is a sharp hourly drop. */
const V_DROP_BPS = -200;
/** 5-bar log return above this (bps) says the drop just turned up. */
const V_TURN_BPS = 30;
/** 30-bar log return below this (bps) is a sharp half-hour drop. */
const R_DROP_BPS = -150;
/** 5-bar log return above this (bps) says the half-hour drop turned up. */
const R_TURN_BPS = 50;
/** Trailing stop: sell when the close falls this far (bps) below the peak. */
const TRAIL_BPS = 80;
/** Take profit: sell when the close rises this far (bps) over the fill. */
const TP_BPS = 200;
/** Max bars to hold a position. */
const MAX_HOLD = 90;
/** Do not chase a vertical move: a 5-bar return above this (bps) is a
 *  blow-off top, not a burst worth following. Applies to the burst and
 *  momentum entries only; V-bounce / recovery are turns off a drop. */
const CHASE_CAP_BPS = 400;
/** No new entries once this batch seq is reached (1440-bar window). */
const NO_ENTRY_AFTER_SEQ = 1410;
/** Wide open: the modelled fill can never move 100% in a minute. */
const MAX_SLIPPAGE_BPS = 10_000;

/** Closes so far, in USDC (float; Number math is deterministic). */
const closes: number[] = [];
/** Fill price of the open position (price_scale units), null when flat. */
let entryPrice: bigint | null = null;
/** Highest close since entry (price_scale units). */
let peakPrice: bigint | null = null;
/** Bars held (counts the fill bar as 1, as in the backtest). */
let heldBars = 0;

/** Log return over the last k bars, in bps; null until k bars exist. */
function retBps(k: number): number | null {
  const n = closes.length;
  if (n <= k) return null;
  const now = closes[n - 1];
  const then = closes[n - 1 - k];
  if (then <= 0 || now <= 0) return null;
  return Math.log(now / then) * 10000;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    // 1. Fold in this batch's fills first (they filled at this bar's open).
    for (const f of batch.fills) {
      if (f.symbol !== SYMBOL || f.status !== 'filled') continue;
      if (f.side === 'buy') {
        entryPrice = BigInt(f.price);
        peakPrice = BigInt(f.price);
        heldBars = 0;
      } else {
        entryPrice = null;
        peakPrice = null;
        heldBars = 0;
      }
    }
    // 2. Record this bar's close.
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(Number(close) / 100000);

    const pos = state.positions.get(SYMBOL);
    const inPosition = pos !== undefined && pos.qty > 0n;

    if (inPosition) {
      if (entryPrice === null) {
        // Defensive: in a position with no recorded fill (never happens
        // in the replay); anchor exits at the current close.
        entryPrice = close;
        peakPrice = close;
        heldBars = 0;
      }
      if (peakPrice !== null && close > peakPrice) peakPrice = close;
      heldBars += 1;
      const entry = entryPrice as bigint;
      const peak = peakPrice as bigint;
      const takeProfit = close * 10000n >= entry * BigInt(10000 + TP_BPS);
      const trailingStop = close * 10000n <= peak * BigInt(10000 - TRAIL_BPS);
      const tooLong = heldBars >= MAX_HOLD;
      if (takeProfit || trailingStop || tooLong) {
        return [{ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // 3. Flat: look for an entry (never in the last 30 bars).
    if (batch.seq >= NO_ENTRY_AFTER_SEQ) return [];
    const r5 = retBps(5);
    const r15 = retBps(15);
    const r30 = retBps(30);
    const r60 = retBps(60);
    const burst = r5 !== null && r5 > BURST_BPS && r5 < CHASE_CAP_BPS;
    const momentum = r15 !== null && r15 > MOM15_BPS && r5 !== null && r5 < CHASE_CAP_BPS;
    const vBounce = r60 !== null && r60 < V_DROP_BPS && r5 !== null && r5 > V_TURN_BPS;
    const recovery = r30 !== null && r30 < R_DROP_BPS && r5 !== null && r5 > R_TURN_BPS;
    if (burst || momentum || vBounce || recovery) {
      if (state.cash <= 0n) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});

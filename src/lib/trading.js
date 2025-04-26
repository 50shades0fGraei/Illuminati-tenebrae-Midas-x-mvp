// src/lib/trading.js
export const initializeParameters = (historicalPrices) => {
  const timeframes = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };
  const thresholds = {};
  const shortWindow = 20, longWindow = 50, rsiWindow = 14;

  const calculateMA = (data, window) => {
    const ma = [];
    for (let i = window - 1; i < data.length; i++) {
      const slice = data.slice(i - window + 1, i + 1);
      ma.push(slice.reduce((sum, p) => sum + p.current_price, 0) / window);
    }
    return ma;
  };

  const calculateRSI = (data, window) => {
    const rsi = [];
    for (let i = window; i < data.length; i++) {
      const slice = data.slice(i - window, i);
      let gains = 0, losses = 0, count = 0;
      for (let j = 1; j < slice.length; j++) {
        const delta = slice[j].current_price - slice[j - 1].current_price;
        if (delta > 0) gains += delta;
        else losses += -delta;
        count++;
      }
      const avgGain = gains / count, avgLoss = losses / count;
      const rs = avgGain / (avgLoss || 1);
      rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
  };

  for (const [name, days] of Object.entries(timeframes)) {
    // Resample data for timeframe
    const tfData = [];
    for (let i = days - 1; i < historicalPrices.length; i += days) {
      const slice = historicalPrices.slice(Math.max(0, i - days + 1), i + 1);
      const avgPrice = slice.reduce((sum, p) => sum + p.current_price, 0) / slice.length;
      tfData.push({ current_price: avgPrice });
    }
    const priceChanges = [];
    for (let i = 1; i < tfData.length; i++) {
      const price = tfData[i].current_price;
      const prevPrice = tfData[i - 1].current_price;
      const change = Math.abs((price - prevPrice) / prevPrice);
      priceChanges.push(change);
    }
    const avgVolatility = priceChanges.length ? priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length : 0.015;
    thresholds[name] = {
      dip: [0.05 * (1 + avgVolatility * 10)], // 5% dip adjusted
      shortMA: calculateMA(tfData, shortWindow),
      longMA: calculateMA(tfData, longWindow),
      rsi: calculateRSI(tfData, rsiWindow)
    };
  }
  return thresholds;
};

export const executeTrade = (currentPrice, prevPrices, thresholds, capital, holdings, lastTradeDates) => {
  const actions = [];
  const newCapital = { ...capital };
  const newHoldings = { ...holdings };
  const newLastTradeDates = { ...lastTradeDates };
  const today = new Date().toISOString().split('T')[0];

  for (const [timeframe, days] of Object.entries({ daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 })) {
    if (newLastTradeDates[timeframe] === today) {
      console.log(`Skipping ${timeframe}: Already traded today`);
      continue;
    }

    const prevPrice = prevPrices[timeframe] || currentPrice;
    const holding = newHoldings[timeframe] || { units: 0, entryPrice: 0 };
    const tfThresholds = thresholds[timeframe];
    const latestShortMA = tfThresholds.shortMA[tfThresholds.shortMA.length - 1] || currentPrice;
    const latestLongMA = tfThresholds.longMA[tfThresholds.longMA.length - 1] || currentPrice;
    const latestRSI = tfThresholds.rsi[tfThresholds.rsi.length - 1] || 50;

    console.log(`${timeframe} - Price: ${currentPrice}, Prev: ${prevPrice}, ShortMA: ${latestShortMA}, LongMA: ${latestLongMA}, RSI: ${latestRSI}`);

    if (!holding.units) {
      const dipThreshold = tfThresholds.dip[0];
      const isDip = currentPrice <= prevPrice * (1 - dipThreshold);
      const isTrendBuy = currentPrice < latestShortMA && latestRSI < 30;
      if (isDip || isTrendBuy) {
        const units = (capital[timeframe] * 0.25) / currentPrice;
        actions.push({ timeframe, type: 'BUY', price: currentPrice, units });
        newCapital[timeframe] -= units * currentPrice;
        newHoldings[timeframe] = { units, entryPrice: currentPrice };
        newLastTradeDates[timeframe] = today;
        console.log(`${timeframe} BUY: ${units} units @ ${currentPrice}`);
      } else {
        console.log(`${timeframe}: No buy (Dip: ${isDip}, Trend: ${isTrendBuy})`);
      }
    } else {
      const priceChange = (currentPrice - prevPrice) / prevPrice;
      const isSpike = Math.abs(priceChange) >= 0.40;
      const isStopLoss = currentPrice <= holding.entryPrice * 0.90;
      const isTrendSell = currentPrice > latestLongMA && latestRSI > 70;
      if (isSpike || isStopLoss || isTrendSell) {
        const profit = (currentPrice - holding.entryPrice) * holding.units;
        actions.push({ timeframe, type: 'SELL', price: currentPrice, profit });
        newCapital[timeframe] += holding.units * currentPrice;
        newHoldings[timeframe] = { units: 0, entryPrice: 0 };
        newLastTradeDates[timeframe] = today;
        const nextTimeframe = {
          daily: 'weekly',
          weekly: 'biweekly',
          biweekly: 'monthly',
          monthly: 'quarterly',
          quarterly: 'daily'
        }[timeframe];
        newCapital[nextTimeframe] += profit * 0.5;
        console.log(`${timeframe} SELL: Profit $${profit}`);
      } else {
        console.log(`${timeframe}: No sell (Spike: ${isSpike}, StopLoss: ${isStopLoss}, Trend: ${isTrendSell})`);
      }
    }
  }

  return { actions, newCapital, newHoldings, newLastTradeDates };
};

export const generateSchedule = (historicalPrices, thresholds) => {
  const schedule = [];
  for (let day = 1; day <= 7; day++) {
    const date = new Date(Date.now() + day * 24 * 60 * 60 * 1000);
    const dailyEntry = {};
    for (const timeframe of ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly']) {
      const tfThresholds = thresholds[timeframe];
      dailyEntry[timeframe] = {
        action: 'BUY',
        threshold: tfThresholds.dip[0],
        estimatedPrice: historicalPrices[historicalPrices.length - 1].current_price * (1 - tfThresholds.dip[0])
      };
    }
    schedule.push({ date: date.toISOString().split('T')[0], trades: dailyEntry });
  }
  return schedule;
};

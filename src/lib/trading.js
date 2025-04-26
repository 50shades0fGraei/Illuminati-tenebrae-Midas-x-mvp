// src/lib/trading.js
export const initializeParameters = (historicalPrices) => {
  const timeframes = {
    daily: 1,
    weekly: 7,
    biweekly: 14,
    monthly: 30,
    quarterly: 90
  };
  const thresholds = {};

  for (const [name, days] of Object.entries(timeframes)) {
    const priceChanges = [];
    for (let i = days; i < historicalPrices.length; i++) {
      const price = historicalPrices[i].current_price;
      const prevPrice = historicalPrices[i - days].current_price;
      const change = Math.abs((price - prevPrice) / prevPrice);
      priceChanges.push(change);
    }
    const avgVolatility = priceChanges.length > 0 ? priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length : 0.015;
    const baseThresholds = name === 'daily' ? [0.001, 0.002, 0.005, 0.008] : [0.005, 0.01, 0.02, 0.03];
    thresholds[name] = baseThresholds.map(t => t * (1 + avgVolatility * 10));
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
    if (newLastTradeDates[timeframe] === today) continue; // One trade/day per timeframe

    const prevPrice = prevPrices[timeframe] || currentPrice;
    const holding = newHoldings[timeframe] || { units: 0, entryPrice: 0 };

    if (!holding.units) {
      for (const threshold of thresholds[timeframe].slice().reverse()) {
        if (currentPrice <= prevPrice * (1 - threshold)) {
          const units = (capital[timeframe] * 0.25) / currentPrice;
          actions.push({ timeframe, type: 'BUY', price: currentPrice, units });
          newCapital[timeframe] -= units * currentPrice;
          newHoldings[timeframe] = { units, entryPrice: currentPrice };
          newLastTradeDates[timeframe] = today;
          break;
        }
      }
    } else {
      const priceChange = (currentPrice - prevPrice) / prevPrice;
      if (Math.abs(priceChange) >= 0.40 || currentPrice <= holding.entryPrice * 0.90) {
        const profit = (currentPrice - holding.entryPrice) * holding.units;
        actions.push({ timeframe, type: 'SELL', price: currentPrice, profit });
        newCapital[timeframe] += holding.units * currentPrice;
        newHoldings[timeframe] = { units: 0, entryPrice: 0 };
        newLastTradeDates[timeframe] = today;
        // Cascade 50% profit to next timeframe
        const nextTimeframe = {
          daily: 'weekly',
          weekly: 'biweekly',
          biweekly: 'monthly',
          monthly: 'quarterly',
          quarterly: null
        }[timeframe];
        if (nextTimeframe) {
          newCapital[nextTimeframe] += profit * 0.5;
        }
      }
    }
  }

  return { actions, newCapital, newHoldings, newLastTradeDates };
};

export const generateSchedule = (historicalPrices, thresholds) => {
  const schedule = [];
  const dipCounts = {};
  for (const timeframe of ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly']) {
    dipCounts[timeframe] = thresholds[timeframe].reduce((acc, t) => ({ ...acc, [t]: 0 }), {});
  }

  for (const [timeframe, days] of Object.entries({ daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 })) {
    for (let i = days; i < historicalPrices.length; i++) {
      const price = historicalPrices[i].current_price;
      const prevPrice = historicalPrices[i - days].current_price;
      const dip = (prevPrice - price) / prevPrice;
      for (const threshold of thresholds[timeframe]) {
        if (dip >= threshold) {
          dipCounts[timeframe][threshold] = (dipCounts[timeframe][threshold] || 0) + 1;
        }
      }
    }
  }

  const today = new Date();
  for (let day = 1; day <= 7; day++) {
    const date = new Date(today.getTime() + day * 24 * 60 * 60 * 1000);
    const dailyEntry = {};
    for (const timeframe of ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly']) {
      let maxThreshold = 0;
      for (const threshold of thresholds[timeframe]) {
        if (dipCounts[timeframe][threshold] / (historicalPrices.length / { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 }[timeframe]) > 0.05 && threshold > maxThreshold) {
          maxThreshold = threshold;
        }
      }
      if (maxThreshold) {
        dailyEntry[timeframe] = {
          action: 'BUY',
          threshold: maxThreshold,
          estimatedPrice: historicalPrices[historicalPrices.length - 1].current_price * (1 - maxThreshold)
        };
      }
    }
    if (Object.keys(dailyEntry).length) {
      schedule.push({ date: date.toISOString().split('T')[0], trades: dailyEntry });
    }
  }
  return schedule;
};

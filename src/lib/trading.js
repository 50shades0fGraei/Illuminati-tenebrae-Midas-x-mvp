// src/lib/trading.js
export const initializeParameters = (historicalPrices) => {
  const priceChanges = [];
  for (let i = 1; i < historicalPrices.length; i++) {
    const price = historicalPrices[i].current_price;
    const prevPrice = historicalPrices[i - 1].current_price;
    const change = Math.abs((price - prevPrice) / prevPrice);
    priceChanges.push(change);
  }
  const avgVolatility = priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length;
  const baseThresholds = [0.001, 0.002, 0.005, 0.008]; // Adjust per your algo
  const adjustedThresholds = baseThresholds.map(t => t * (1 + avgVolatility * 10));
  return adjustedThresholds;
};

export const executeTrade = (currentPrice, prevPrice, adjustedThresholds, capital, holding, entryPrice) => {
  let action = null;
  let units = 0;
  let newCapital = capital;
  let newHolding = holding;
  let newEntryPrice = entryPrice;

  // Buy logic: Check for dip
  if (!holding) {
    for (const threshold of adjustedThresholds) {
      if (currentPrice <= prevPrice * (1 - threshold)) {
        units = (capital * 0.25) / currentPrice; // Invest 25% of capital
        action = { type: 'BUY', price: currentPrice, units };
        newCapital -= units * currentPrice;
        newHolding = true;
        newEntryPrice = currentPrice;
        break;
      }
    }
  } else {
    // Sell logic: 40% spike or 10% stop loss
    const priceChange = (currentPrice - prevPrice) / prevPrice;
    if (Math.abs(priceChange) >= 0.40 || currentPrice <= entryPrice * 0.90) {
      const profit = (currentPrice - entryPrice) * holding.units;
      action = { type: 'SELL', price: currentPrice, profit };
      newCapital += holding.units * currentPrice;
      newHolding = false;
      newEntryPrice = 0;
    }
  }

  return { action, newCapital, newHolding, newEntryPrice };
};

export const generateSchedule = (historicalPrices, adjustedThresholds) => {
  const schedule = [];
  const dipCounts = { 0.001: 0, 0.002: 0, 0.005: 0, 0.008: 0 };
  for (let i = 1; i < historicalPrices.length; i++) {
    const price = historicalPrices[i].current_price;
    const prevPrice = historicalPrices[i - 1].current_price;
    const dip = (prevPrice - price) / prevPrice;
    for (const threshold of adjustedThresholds) {
      if (dip >= threshold) {
        dipCounts[threshold] = (dipCounts[threshold] || 0) + 1;
      }
    }
  }
  const today = new Date();
  for (let day = 1; day <= 7; day++) {
    const date = new Date(today.getTime() + day * 24 * 60 * 60 * 1000);
    let maxThreshold = 0;
    for (const threshold of adjustedThresholds) {
      if (dipCounts[threshold] / historicalPrices.length > 0.05 && threshold > maxThreshold) {
        maxThreshold = threshold;
      }
    }
    if (maxThreshold) {
      schedule.push({
        date: date.toISOString().split('T')[0],
        action: 'BUY',
        threshold: maxThreshold,
        estimatedPrice: historicalPrices[historicalPrices.length - 1].current_price * (1 - maxThreshold)
      });
    }
  }
  return schedule;
};

export const calculateSignals = (prices, buyThresholds = [0.001, 0.002, 0.005, 0.008], sellTrigger = 0.40) => {
  const signals = [];
  let holding = false;
  let entryPrice = 0;
  let trades = 0;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i].current_price;
    const prevPrice = prices[i - 1].current_price;
    const priceChange = (price - prevPrice) / prevPrice;

    if (!holding) {
      for (const threshold of buyThresholds) {
        if (price <= prevPrice * (1 - threshold) && trades < 120) {
          signals.push({ time: prices[i].last_updated, signal: 1.0, price });
          holding = true;
          entryPrice = price;
          trades++;
          break;
        }
      }
    } else {
      if (Math.abs(priceChange) >= sellTrigger || price <= entryPrice * (1 - 0.1)) {
        signals.push({ time: prices[i].last_updated, signal: -1.0, price });
        holding = false;
        trades++;
      }
    }
  }
  return signals;
};
// Calculate volatility and adjust buy thresholds based on historical data
export const initializeParameters = (historicalPrices) => {
  const priceChanges = [];
  for (let i = 1; i < historicalPrices.length; i++) {
    const price = historicalPrices[i].current_price;
    const prevPrice = historicalPrices[i - 1].current_price;
    const change = Math.abs((price - prevPrice) / prevPrice);
    priceChanges.push(change);
  }
  const avgVolatility = priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length;
  // Scale buy thresholds based on volatility (e.g., higher volatility -> wider thresholds)
  const baseThresholds = [0.001, 0.002, 0.005, 0.008];
  const adjustedThresholds = baseThresholds.map(t => t * (1 + avgVolatility * 10));
  return adjustedThresholds;
};

// Generate schedule based on historical dip frequency
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
  // Predict buys for next 7 days based on dip frequency
  const today = new Date();
  for (let day = 1; day <= 7; day++) {
    const date = new Date(today.getTime() + day * 24 * 60 * 60 * 1000);
    for (const threshold of adjustedThresholds) {
      if (dipCounts[threshold] / historicalPrices.length > 0.05) { // At least 5% of days had this dip
        schedule.push({
          date: date.toISOString().split('T')[0],
          action: 'BUY',
          threshold,
          estimatedPrice: historicalPrices[historicalPrices.length - 1].current_price * (1 - threshold)
        });
      }
    }
  }
  return schedule;
};

export const calculateSignals = (prices, buyThresholds = [0.001, 0.002, 0.005, 0.008], sellTrigger = 0.40) => {
  const signals = [];
  let holding = false;
  let entryPrice = 0;
  let trades = 0;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i].current_price;
    const prevPrice = prices[i - 1].current_price;
    const priceChange = (price - prevPrice) / prevPrice;

    if (!holding) {
      for (const threshold of buyThresholds) {
        if (price <= prevPrice * (1 - threshold) && trades < 120) {
          signals.push({ time: prices[i].last_updated, signal: 1.0, price });
          holding = true;
          entryPrice = price;
          trades++;
          break;
        }
      }
    } else {
      if (Math.abs(priceChange) >= sellTrigger || price <= entryPrice * (1 - 0.1)) {
        signals.push({ time: prices[i].last_updated, signal: -1.0, price });
        holding = false;
        trades++;
      }
    }
  }
  return signals;
};

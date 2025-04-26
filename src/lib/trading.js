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

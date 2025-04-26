import { useState, useEffect } from 'react';
import { calculateSignals } from '@/lib/trading';

export default function Dashboard() {
  const [prices, setPrices] = useState([]);
  const [signals, setSignals] = useState([]);
  const [getBalance, setGetBalance] = useState(0);
  const [capital, setCapital] = useState(1000);
  const [trades, setTrades] = useState([]);

  const fetchPrices = async () => {
    const res = await fetch('/api/coin-prices');
    const data = await res.json();
    if (data.success) {
      setPrices((prev) => {
        const newPrices = [...prev, ...data.prices].slice(-100); // Keep last 100 prices
        const btcPrices = newPrices.filter((p) => p.id === 'bitcoin');
        const newSignals = calculateSignals(btcPrices);
        setSignals(newSignals);
        updateTrades(newSignals, btcPrices);
        return newPrices;
      });
    }
  };

  const mintGet = async () => {
    const res = await fetch('/api/mint-get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'randall', joules: 100 }),
    });
    const data = await res.json();
    if (data.success) setGetBalance(getBalance + data.gets);
  };

  const updateTrades = (signals, prices) => {
    let currentCapital = capital;
    const newTrades = [];

    signals.forEach((signal) => {
      const price = prices.find((p) => p.last_updated === signal.time)?.current_price;
      if (signal.signal === 1.0) {
        const units = (currentCapital * 0.25) / price; // 25% of capital
        newTrades.push({ id: trades.length + newTrades.length + 1, type: 'BUY', price, units });
        currentCapital -= units * price;
      } else if (signal.signal === -1.0) {
        const lastBuy = newTrades.findLast((t) => t.type === 'BUY');
        if (lastBuy) {
          const profit = (price - lastBuy.price) * lastBuy.units;
          newTrades.push({ id: trades.length + newTrades.length + 1, type: 'SELL', price, profit });
          currentCapital += lastBuy.units * price;
        }
      }
    });

    setTrades((prev) => [...prev, ...newTrades].slice(-50)); // Keep last 50 trades
    setCapital(currentCapital);
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // Update every 60s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Midas-x MVP Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl mb-2">Crypto Prices (CoinGecko)</h2>
          <ul>
            {prices.slice(-2).map((coin) => (
              <li key={coin.id} className="mb-1">
                {coin.name}: ${coin.current_price} ({coin.price_change_percentage_24h.toFixed(2)}% 24h)
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl mb-2">GET Balance</h2>
          <p>{getBalance} GET ($10/GET = ${getBalance * 10})</p>
          <button
            onClick={mintGet}
            className="mt-2 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Mint GET (100 J)
          </button>
        </div>
        <div className="bg-gray-100 p-4 rounded col-span-1 md:col-span-2">
          <h2 className="text-xl mb-2">Trades (1,000x ROI Potential)</h2>
          <p>Capital: ${capital.toFixed(2)}</p>
          <ul className="max-h-64 overflow-y-auto">
            {trades.map((trade) => (
              <li key={trade.id} className="mb-1">
                {trade.type} @ ${trade.price.toFixed(2)}{' '}
                {trade.profit ? `(Profit: $${trade.profit.toFixed(2)})` : `(${trade.units.toFixed(4)} units)`}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

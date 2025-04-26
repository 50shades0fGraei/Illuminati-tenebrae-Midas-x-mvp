import { useState, useEffect } from 'react';
import { initializeParameters, executeTrade, generateSchedule } from '@/lib/trading';

export default function Dashboard() {
  const [prices, setPrices] = useState([]);
  const [historicalPrices, setHistoricalPrices] = useState([]);
  const [capital, setCapital] = useState(1000);
  const [trades, setTrades] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [buyThresholds, setBuyThresholds] = useState([0.001, 0.002, 0.005, 0.008]);
  const [holding, setHolding] = useState(false);
  const [entryPrice, setEntryPrice] = useState(0);
  const [getBalance, setGetBalance] = useState(0);

  const fetchHistoricalPrices = async () => {
    const res = await fetch('/api/coin-prices?historical=true');
    const data = await res.json();
    if (data.success) {
      setHistoricalPrices(data.prices);
      const adjustedThresholds = initializeParameters(data.prices);
      setBuyThresholds(adjustedThresholds);
      const tradeSchedule = generateSchedule(data.prices, adjustedThresholds);
      setSchedule(tradeSchedule);
      console.log('Trade Schedule:', tradeSchedule);
    }
  };

  const fetchPrices = async () => {
    const res = await fetch('/api/coin-prices');
    const data = await res.json();
    if (data.success) {
      setPrices((prev) => {
        const newPrices = [...prev, ...data.prices].slice(-100);
        const btcPrices = newPrices.filter((p) => p.id === 'bitcoin');
        if (btcPrices.length >= 2) {
          const currentPrice = btcPrices[btcPrices.length - 1].current_price;
          const prevPrice = btcPrices[btcPrices.length - 2].current_price;
          const { action, newCapital, newHolding, newEntryPrice } = executeTrade(
            currentPrice,
            prevPrice,
            buyThresholds,
            capital,
            holding,
            entryPrice
          );
          if (action) {
            setTrades((prev) => [...prev, { id: prev.length + 1, ...action }].slice(-50));
            setCapital(newCapital);
            setHolding(newHolding);
            setEntryPrice(newEntryPrice);
          }
        }
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

  useEffect(() => {
    fetchHistoricalPrices();
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
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
        <div className="bg-gray-100 p-4 rounded col-span-1 md:col-span-2">
          <h2 className="text-xl mb-2">Trade Schedule (Next 7 Days)</h2>
          <ul className="max-h-64 overflow-y-auto">
            {schedule.map((entry, index) => (
              <li key={index} className="mb-1">
                {entry.date}: {entry.action} at {(entry.threshold * 100).toFixed(1)}% dip (~${entry.estimatedPrice.toFixed(0)})
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

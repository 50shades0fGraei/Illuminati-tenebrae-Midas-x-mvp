# Add to top
from binance.client import Client
from binance.enums import *

# Replace fetch_binance_data
def fetch_binance_data(ticker, period='3mo', interval='1h'):
    try:
        client = Client(os.getenv('BINANCE_US_API_KEY'), os.getenv('BINANCE_US_API_SECRET'))
        symbol = ticker.replace('-', '')  # e.g., SHIBUSD
        klines = client.get_historical_klines(symbol, Client.KLINE_INTERVAL_1HOUR, period)
        df = pd.DataFrame(klines, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_asset_volume', 'trades', 'taker_buy_base', 'taker_buy_quote', 'ignored'])
        df['Date'] = pd.to_datetime(df['timestamp'], unit='ms')
        df['Close'] = df['close'].astype(float)
        return df[['Date', 'Close']]
    except Exception as e:
        logging.error(f'Error fetching {ticker}: {e}')
        return pd.DataFrame()

# Add trade execution
def execute_binance_trade(ticker, side, quantity, price):
    try:
        client = Client(os.getenv('BINANCE_US_API_KEY'), os.getenv('BINANCE_US_API_SECRET'))
        symbol = ticker.replace('-', '')
        order = client.create_order(
            symbol=symbol,
            side=side,  # SIDE_BUY or SIDE_SELL
            type=ORDER_TYPE_LIMIT,
            timeInForce=TIME_IN_FORCE_GTC,
            quantity=quantity,
            price=f"{price:.8f}"
        )
        logging.info(f'{ticker} {side} Order: {order}')
        return order
    except Exception as e:
        logging.error(f'Error executing {ticker} {side}: {e}')
        return None

# Update execute_trades (main buy/sell block)
def execute_trades(data, stop_loss, trailing_stop, fund, buy_thresholds, ratio, cycle_hours, spectrum='main', sell_strategy='main_first', timeframe='daily', market_type='small', ticker='SHIB-USD', market_data=None):
    if data.empty:
        return data, 0
    data['Position'] = 0.0
    data['Units'] = 0
    data['Capital'] = fund
    data['Profit'] = 0.0
    data['Realloc_Signal'] = 0.0
    data['Realloc_Units'] = 0
    data['Realloc_Position'] = 0.0
    holding = False
    realloc_holding = False
    entry_price = 0
    realloc_entry_price = 0
    realloc_ticker = None
    high_vol = data['Volatility'].mean() > predicted_swings[ticker] * 1.5 if not data['Volatility'].empty else False
    base_trade_size = pyramid_sizes[market_type]['outer'][timeframe][high_vol] / 3
    realloc_size = base_trade_size * REALLOC_ALLOCATION
    safety_fund = 0
    gets_minted = 0

    for i in range(1, len(data)):
        # Main trade sell
        if i > 1 and data['Signal'].iloc[i-1] == -1.0 and holding:
            sale_value = data['Units'].iloc[i-1] * data['Close'].iloc[i]
            profit = sale_value - data['Position'].iloc[i-1]
            profit *= double_down_multiplier if data['Signal'].iloc[i-1] >= 6.0 else 1
            cascade_profit = profit * cascade_ratios[market_type][timeframe][high_vol]
            safety_profit = profit * safety_ratio
            data.loc[data.index[i], 'Profit'] = cascade_profit
            safety_fund += safety_profit
            data.loc[data.index[i], 'Capital'] += sale_value - cascade_profit
            gets_minted += int(sale_value / 1000)
            # Execute sell
            execute_binance_trade(ticker, SIDE_SELL, data['Units'].iloc[i-1], data['Close'].iloc[i])
            logging.info(f'{ticker} {timeframe} {spectrum} SELL: Profit ${cascade_profit:.2f}, Safety Fund ${safety_profit:.2f}, GETs Minted {gets_minted}')
            holding = False

        # Reallocation
        if market_data and not holding and not realloc_holding:
            price_change = data['Close'].pct_change().iloc[i] if i > 1 else 0
            if price_change < -0.01:
                realloc_ticker = detect_top_riser(market_data)
                if realloc_ticker and realloc_ticker != ticker:
                    realloc_price = market_data[realloc_ticker]['Close'].iloc[i] if i < len(market_data[realloc_ticker]) else market_data[realloc_ticker]['Close'].iloc[-1]
                    units_to_buy = realloc_size / realloc_price
                    data.loc[data.index[i], 'Realloc_Signal'] = 1.0
                    data.loc[data.index[i], 'Realloc_Units'] = units_to_buy
                    data.loc[data.index[i], 'Realloc_Position'] = realloc_size
                    data.loc[data.index[i], 'Capital'] -= realloc_size
                    # Execute realloc buy
                    execute_binance_trade(realloc_ticker, SIDE_BUY, units_to_buy, realloc_price)
                    realloc_holding = True
                    realloc_entry_price = realloc_price
                    logging.info(f'Reallocating to {realloc_ticker}: ${realloc_size:.2f}')
        elif realloc_holding and realloc_ticker:
            realloc_price = market_data[realloc_ticker]['Close'].iloc[i] if i < len(market_data[realloc_ticker]) else market_data[realloc_ticker]['Close'].iloc[-1]
            if realloc_price >= realloc_entry_price * (1 + REALLOC_GAIN):
                sale_value = data['Realloc_Units'].iloc[i-1] * realloc_price
                profit = sale_value - data['Realloc_Position'].iloc[i-1]
                data.loc[data.index[i], 'Realloc_Signal'] = -1.0
                data.loc[data.index[i], 'Profit'] += profit
                data.loc[data.index[i], 'Capital'] += sale_value
                data.loc[data.index[i], 'Realloc_Units'] = 0
                data.loc[data.index[i], 'Realloc_Position'] = 0
                safety_fund += profit * safety_ratio
                gets_minted += int(sale_value / 1000)
                # Execute realloc sell
                execute_binance_trade(realloc_ticker, SIDE_SELL, data['Realloc_Units'].iloc[i-1], realloc_price)
                logging.info(f'{realloc_ticker} Realloc SELL: Profit ${profit:.2f}, Safety Fund ${profit * safety_ratio:.2f}, GETs Minted {gets_minted}')
                realloc_holding = False
                realloc_ticker = None

        # Main buy
        trade_size = base_trade_size * double_down_multiplier if data['Signal'].iloc[i] >= 6.0 else base_trade_size
        if data['Signal'].iloc[i] >= 1.0 and not holding and data['Capital'].iloc[i] >= trade_size:
            units_to_buy = trade_size / data['Close'].iloc[i]
            data.loc[data.index[i], 'Position'] = trade_size
            data.loc[data.index[i], 'Units'] = units_to_buy
            data.loc[data.index[i], 'Capital'] -= trade_size
            # Execute buy
            execute_binance_trade(ticker, SIDE_BUY, units_to_buy, data['Close'].iloc[i])
            holding = True
            entry_price = data['Close'].iloc[i]
            logging.info(f'{ticker} {timeframe} {spectrum} BUY: {units_to_buy:.2f} units @ ${data["Close"].iloc[i]:.8f}')

        # Stop-loss/trailing-stop
        elif holding:
            data.loc[data.index[i], 'Units'] = data['Units'].iloc[i-1]
            stop_loss_price = entry_price * (1 - stop_loss)
            trailing_stop_price = data['Close'].iloc[i-1] * (1 - trailing_stop)
            if data['Close'].iloc[i] <= min(stop_loss_price, trailing_stop_price):
                sale_value = data['Units'].iloc[i-1] * data['Close'].iloc[i]
                profit = sale_value - data['Position'].iloc[i-1]
                profit *= double_down_multiplier if data['Signal'].iloc[i-1] >= 6.0 else 1
                cascade_profit = profit * cascade_ratios[market_type][timeframe][high_vol]
                safety_profit = profit * safety_ratio
                data.loc[data.index[i], 'Profit'] = cascade_profit
                safety_fund += safety_profit
                data.loc[data.index[i], 'Position'] = -sale_value
                data.loc[data.index[i], 'Units'] = 0
                data.loc[data.index[i], 'Capital'] += sale_value - cascade_profit
                gets_minted += int(sale_value / 1000)
                # Execute stop sell
                execute_binance_trade(ticker, SIDE_SELL, data['Units'].iloc[i-1], data['Close'].iloc[i])
                logging.info(f'{ticker} {timeframe} {spectrum} STOP SELL: Profit ${cascade_profit:.2f}, Safety Fund ${safety_profit:.2f}, GETs Minted {gets_minted}')
                holding = False
            else:
                data.loc[data.index[i], 'Position'] = 0
        data.loc[data.index[i], 'Capital'] = data['Capital'].iloc[i-1] if i > 1 and not holding else data['Capital'].iloc[i]
    return data, safety_fund, gets_minted

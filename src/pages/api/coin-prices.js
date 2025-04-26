import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: 'bitcoin,ethereum',
          x_cg_demo_api_key: process.env.COINGECKO_API_KEY,
        },
      });
      res.status(200).json({ success: true, prices: response.data });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

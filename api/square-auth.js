// Square OAuth: generate authorization URL
export default function handler(req, res) {
  const clientId = process.env.SQUARE_APP_ID
  if (!clientId) return res.status(500).json({ error: 'SQUARE_APP_ID not configured' })

  const env = process.env.SQUARE_ENVIRONMENT || 'production'
  const baseUrl = env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  const scopes = [
    'ITEMS_READ',
    'MERCHANT_PROFILE_READ',
    'INVENTORY_READ',
    'ORDERS_READ',
    'PAYMENTS_READ',
  ].join('+')

  const state = req.query.state || Math.random().toString(36).slice(2)
  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/square-callback`

  const url = `${baseUrl}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`

  res.json({ url, state })
}

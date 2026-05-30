// Square OAuth callback: exchange code for access token
export default async function handler(req, res) {
  const { code, state } = req.query

  if (!code) {
    return res.redirect('/?square=error&reason=no_code')
  }

  const clientId = process.env.SQUARE_APP_ID
  const clientSecret = process.env.SQUARE_APP_SECRET
  if (!clientId || !clientSecret) {
    return res.redirect('/?square=error&reason=not_configured')
  }

  const env = process.env.SQUARE_ENVIRONMENT || 'production'
  const baseUrl = env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/square-callback`

  try {
    const tokenRes = await fetch(`${baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    const data = await tokenRes.json()

    if (data.access_token) {
      // Pass token back to frontend via URL fragment (not in query string for security)
      // The frontend will grab it and store it, then clear the URL
      const params = new URLSearchParams({
        square: 'connected',
        token: data.access_token,
        refresh: data.refresh_token || '',
        expires: data.expires_at || '',
        merchant: data.merchant_id || '',
      })
      return res.redirect(`/?${params.toString()}`)
    } else {
      return res.redirect(`/?square=error&reason=${encodeURIComponent(data.message || 'token_exchange_failed')}`)
    }
  } catch (err) {
    return res.redirect(`/?square=error&reason=${encodeURIComponent(err.message)}`)
  }
}

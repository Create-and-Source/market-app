// Fetch sales/orders from Square for a specific date range
export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })

  const { startDate, endDate } = req.query
  if (!startDate) return res.status(400).json({ error: 'startDate required (YYYY-MM-DD)' })

  const env = process.env.SQUARE_ENVIRONMENT || 'production'
  const baseUrl = env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  // Default endDate to startDate + 1 day (full day range)
  const start = new Date(startDate + 'T00:00:00Z').toISOString()
  const end = endDate
    ? new Date(endDate + 'T23:59:59Z').toISOString()
    : new Date(new Date(startDate + 'T00:00:00Z').getTime() + 86400000).toISOString()

  try {
    // First get location IDs
    const locRes = await fetch(`${baseUrl}/v2/locations`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const locData = await locRes.json()
    const locationIds = (locData.locations || []).map(l => l.id)

    if (locationIds.length === 0) {
      return res.json({ orders: [], totalRevenue: 0, itemsSold: [] })
    }

    // Search orders for date range
    const ordersRes = await fetch(`${baseUrl}/v2/orders/search`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_ids: locationIds,
        query: {
          filter: {
            date_time_filter: {
              created_at: {
                start_at: start,
                end_at: end,
              }
            },
            state_filter: { states: ['COMPLETED'] }
          },
          sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' }
        }
      }),
    })

    const ordersData = await ordersRes.json()

    if (!ordersRes.ok) {
      return res.status(ordersRes.status).json({ error: ordersData.errors?.[0]?.detail || 'Failed to fetch orders' })
    }

    const orders = ordersData.orders || []

    // Calculate totals
    let totalRevenue = 0
    const itemCounts = {}

    for (const order of orders) {
      // Total from net amounts
      const total = order.total_money?.amount || 0
      totalRevenue += total / 100

      // Count items sold
      for (const lineItem of (order.line_items || [])) {
        const name = lineItem.name || 'Unknown'
        const qty = parseInt(lineItem.quantity || '1')
        const catalogId = lineItem.catalog_object_id || null
        const key = catalogId || name

        if (!itemCounts[key]) {
          itemCounts[key] = { name, quantity: 0, revenue: 0, catalogId }
        }
        itemCounts[key].quantity += qty
        itemCounts[key].revenue += (lineItem.total_money?.amount || 0) / 100
      }
    }

    const itemsSold = Object.values(itemCounts).sort((a, b) => b.quantity - a.quantity)

    res.json({
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      orderCount: orders.length,
      itemsSold,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

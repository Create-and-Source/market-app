// Fetch products from Square Catalog API
export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })

  const env = process.env.SQUARE_ENVIRONMENT || 'production'
  const baseUrl = env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  try {
    // Fetch catalog items
    const catalogRes = await fetch(`${baseUrl}/v2/catalog/list?types=ITEM`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const catalogData = await catalogRes.json()

    if (!catalogRes.ok) {
      return res.status(catalogRes.status).json({ error: catalogData.errors?.[0]?.detail || 'Failed to fetch catalog' })
    }

    const items = (catalogData.objects || []).map(obj => {
      const item = obj.item_data || {}
      const variation = item.variations?.[0]
      const price = variation?.item_variation_data?.price_money
      const imageId = item.image_ids?.[0]

      return {
        squareId: obj.id,
        name: item.name || 'Unnamed',
        description: item.description || '',
        category: item.category?.name || '',
        price: price ? price.amount / 100 : 0,
        currency: price?.currency || 'USD',
        variationId: variation?.id || null,
        imageId: imageId || null,
        sku: variation?.item_variation_data?.sku || '',
      }
    })

    // Fetch images if any
    const imageIds = items.filter(i => i.imageId).map(i => i.imageId)
    let imageMap = {}

    if (imageIds.length > 0) {
      try {
        const imgRes = await fetch(`${baseUrl}/v2/catalog/batch-retrieve`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ object_ids: imageIds.slice(0, 100) }),
        })
        const imgData = await imgRes.json()
        for (const obj of (imgData.objects || [])) {
          if (obj.image_data?.url) {
            imageMap[obj.id] = obj.image_data.url
          }
        }
      } catch {}
    }

    // Attach images
    const products = items.map(i => ({
      ...i,
      image: imageMap[i.imageId] || null,
    }))

    res.json({ products, cursor: catalogData.cursor || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

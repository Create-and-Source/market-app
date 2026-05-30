import { useState, useEffect, useRef } from 'react'
import {
  CalendarDays, Package, DollarSign, Camera, CheckSquare,
  Plus, X, ChevronLeft, MapPin, Clock, Sun, Cloud, CloudRain,
  Thermometer, TrendingUp, TrendingDown, Star, Trash2, Edit3,
  Search, Eye, ShoppingBag, Check, AlertCircle, ArrowUpRight,
  Minus, Image, Settings, RefreshCw, Link2, Unlink, Download,
  Loader2, CheckCircle2, XCircle
} from 'lucide-react'
import './App.css'

// ─── Helpers ──────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmtShort = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const today = () => new Date().toISOString().split('T')[0]

function useStore(key, initial) {
  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial }
    catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(data)) }, [key, data])
  return [data, setData]
}

// ─── Square Hook ──────────────────────────────────────────
function useSquare() {
  const [square, setSquare] = useStore('md_square', { connected: false, token: '', refresh: '', merchant: '', expires: '' })
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null) // { type: 'success'|'error', message: '' }

  // Handle OAuth callback on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('square') === 'connected' && params.get('token')) {
      setSquare({
        connected: true,
        token: params.get('token'),
        refresh: params.get('refresh') || '',
        merchant: params.get('merchant') || '',
        expires: params.get('expires') || '',
      })
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('square') === 'error') {
      setSyncStatus({ type: 'error', message: `Square connection failed: ${params.get('reason') || 'unknown error'}` })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function connect() {
    setSyncing(true)
    try {
      const res = await fetch('/api/square-auth')
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setSyncStatus({ type: 'error', message: data.error || 'Could not start Square connection' })
        setSyncing(false)
      }
    } catch (err) {
      setSyncStatus({ type: 'error', message: err.message })
      setSyncing(false)
    }
  }

  function disconnect() {
    setSquare({ connected: false, token: '', refresh: '', merchant: '', expires: '' })
    setSyncStatus({ type: 'success', message: 'Disconnected from Square' })
  }

  async function syncProducts() {
    if (!square.token) return []
    setSyncing(true)
    setSyncStatus(null)
    try {
      const res = await fetch('/api/square-catalog', {
        headers: { 'Authorization': `Bearer ${square.token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch products')
      setSyncing(false)
      setSyncStatus({ type: 'success', message: `Synced ${data.products.length} products from Square` })
      return data.products
    } catch (err) {
      setSyncing(false)
      setSyncStatus({ type: 'error', message: err.message })
      return []
    }
  }

  async function syncSales(date) {
    if (!square.token || !date) return null
    setSyncing(true)
    setSyncStatus(null)
    try {
      const res = await fetch(`/api/square-sales?startDate=${date}&endDate=${date}`, {
        headers: { 'Authorization': `Bearer ${square.token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch sales')
      setSyncing(false)
      setSyncStatus({ type: 'success', message: `Found ${data.orderCount} orders totaling ${fmt(data.totalRevenue)}` })
      return data
    } catch (err) {
      setSyncing(false)
      setSyncStatus({ type: 'error', message: err.message })
      return null
    }
  }

  return { square, syncing, syncStatus, setSyncStatus, connect, disconnect, syncProducts, syncSales }
}

// ─── App ──────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('markets')
  const [markets, setMarkets] = useStore('md_markets', [])
  const [products, setProducts] = useStore('md_products', [])
  const [templates, setTemplates] = useStore('md_templates', [
    { id: 'default', name: 'Do Not Forget', items: [
      { id: '1', text: 'Tent + weights', checked: false },
      { id: '2', text: 'Table + tablecloth', checked: false },
      { id: '3', text: 'Card reader / Square', checked: false },
      { id: '4', text: 'Cash box + change', checked: false },
      { id: '5', text: 'Phone charger', checked: false },
      { id: '6', text: 'Business cards', checked: false },
      { id: '7', text: 'Price signs', checked: false },
      { id: '8', text: 'Bags for customers', checked: false },
      { id: '9', text: 'Water + snacks', checked: false },
      { id: '10', text: 'Sunscreen', checked: false },
    ]}
  ])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const sq = useSquare()

  const upcomingMarkets = markets.filter(m => m.date >= today()).sort((a,b) => a.date.localeCompare(b.date))
  const pastMarkets = markets.filter(m => m.date < today()).sort((a,b) => b.date.localeCompare(a.date))
  const totalRevenue = pastMarkets.reduce((s, m) => s + (m.revenue || 0), 0)
  const totalProfit = pastMarkets.reduce((s, m) => s + getProfit(m), 0)
  const totalMarkets = pastMarkets.length

  function getProfit(m) {
    return (m.revenue || 0) - (m.boothFee || 0) - (m.gas || 0) - (m.parking || 0) - (m.supplies || 0) - (m.food || 0) - (m.otherExpense || 0)
  }

  function getVerdict(m) {
    const p = getProfit(m)
    if (p > 100) return 'worth'
    if (p > 0) return 'meh'
    return 'skip'
  }

  function saveMarket(data) {
    if (data.id) {
      setMarkets(prev => prev.map(m => m.id === data.id ? { ...m, ...data } : m))
    } else {
      setMarkets(prev => [...prev, { ...data, id: uid(), photos: [], packingList: [], productsBrought: [], interests: [] }])
    }
    setModal(null)
  }

  function deleteMarket(id) {
    setConfirm({
      message: 'Are you sure you want to delete this market?',
      onConfirm: () => { setMarkets(prev => prev.filter(m => m.id !== id)); setSelectedMarket(null); setConfirm(null) }
    })
  }

  function saveProduct(data) {
    if (data.id) {
      setProducts(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p))
    } else {
      setProducts(prev => [...prev, { ...data, id: uid() }])
    }
    setModal(null)
  }

  function deleteProduct(id) {
    setConfirm({
      message: 'Are you sure you want to delete this product?',
      onConfirm: () => { setProducts(prev => prev.filter(p => p.id !== id)); setConfirm(null) }
    })
  }

  // Import Square products
  async function importSquareProducts() {
    const squareProducts = await sq.syncProducts()
    if (squareProducts.length === 0) return

    let imported = 0
    setProducts(prev => {
      const updated = [...prev]
      for (const sp of squareProducts) {
        const existing = updated.find(p => p.squareId === sp.squareId)
        if (existing) {
          Object.assign(existing, { name: sp.name, price: sp.price, image: sp.image || existing.image, squareId: sp.squareId })
        } else {
          updated.push({ id: uid(), name: sp.name, price: sp.price, category: sp.category, image: sp.image, squareId: sp.squareId, stock: undefined })
          imported++
        }
      }
      return updated
    })
  }

  // Pull Square sales for a market
  async function pullSquareSales(marketId) {
    const market = markets.find(m => m.id === marketId)
    if (!market) return
    const data = await sq.syncSales(market.date)
    if (!data) return

    setMarkets(prev => prev.map(m => {
      if (m.id !== marketId) return m
      return {
        ...m,
        revenue: data.totalRevenue,
        squareSales: data,
      }
    }))
  }

  function addPhotoToMarket(marketId, photo, label) {
    setMarkets(prev => prev.map(m =>
      m.id === marketId ? { ...m, photos: [...(m.photos || []), { id: uid(), url: photo, label, date: today() }] } : m
    ))
  }

  function removePhotoFromMarket(marketId, photoId) {
    setConfirm({
      message: 'Are you sure you want to delete this photo?',
      onConfirm: () => {
        setMarkets(prev => prev.map(m =>
          m.id === marketId ? { ...m, photos: (m.photos || []).filter(p => p.id !== photoId) } : m
        ))
        setConfirm(null)
      }
    })
  }

  function handlePhotoUpload(e, marketId, label) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { addPhotoToMarket(marketId, ev.target.result, label) }
    reader.readAsDataURL(file)
  }

  // ─── Render ───
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon"><ShoppingBag size={20} /></div>
          <h1>Market Day</h1>
        </div>
        {sq.square.connected && (
          <div className="badge badge-green" style={{ gap: 6 }}>
            <CheckCircle2 size={12} /> Square
          </div>
        )}
      </header>

      {/* Sync status toast */}
      {sq.syncStatus && (
        <div className={`sync-toast ${sq.syncStatus.type}`} onClick={() => sq.setSyncStatus(null)}>
          {sq.syncStatus.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {sq.syncStatus.message}
          <button className="sync-toast-close"><X size={14} /></button>
        </div>
      )}

      <main className="main-content">
        {selectedMarket ? (
          <MarketDetail
            market={markets.find(m => m.id === selectedMarket)}
            onBack={() => setSelectedMarket(null)}
            onEdit={(m) => setModal({ type: 'market', data: m })}
            onDelete={deleteMarket}
            products={products}
            templates={templates}
            onUpdateMarket={(data) => setMarkets(prev => prev.map(m => m.id === data.id ? data : m))}
            onPhotoUpload={handlePhotoUpload}
            onPhotoDelete={removePhotoFromMarket}
            onLightbox={setLightbox}
            getProfit={getProfit}
            getVerdict={getVerdict}
            square={sq.square}
            squareSyncing={sq.syncing}
            onPullSquareSales={pullSquareSales}
          />
        ) : tab === 'markets' ? (
          <MarketsTab
            upcoming={upcomingMarkets}
            past={pastMarkets}
            onSelect={setSelectedMarket}
            onAdd={() => setModal({ type: 'market', data: null })}
            getProfit={getProfit}
            getVerdict={getVerdict}
          />
        ) : tab === 'products' ? (
          <ProductsTab
            products={products}
            onAdd={() => setModal({ type: 'product', data: null })}
            onEdit={(p) => setModal({ type: 'product', data: p })}
            onDelete={deleteProduct}
            square={sq.square}
            squareSyncing={sq.syncing}
            onSyncSquare={importSquareProducts}
          />
        ) : tab === 'packing' ? (
          <PackingTab
            templates={templates}
            setTemplates={setTemplates}
          />
        ) : tab === 'money' ? (
          <MoneyTab
            markets={pastMarkets}
            totalRevenue={totalRevenue}
            totalProfit={totalProfit}
            totalMarkets={totalMarkets}
            getProfit={getProfit}
            getVerdict={getVerdict}
            onSelect={setSelectedMarket}
          />
        ) : tab === 'photos' ? (
          <PhotosTab
            markets={markets}
            onSelect={setSelectedMarket}
            onLightbox={setLightbox}
          />
        ) : tab === 'settings' ? (
          <SettingsTab
            square={sq.square}
            syncing={sq.syncing}
            onConnect={sq.connect}
            onDisconnect={sq.disconnect}
            products={products}
            onSyncProducts={importSquareProducts}
          />
        ) : null}
      </main>

      <nav className="bottom-nav">
        {[
          { id: 'markets', icon: CalendarDays, label: 'Markets' },
          { id: 'products', icon: Package, label: 'Products' },
          { id: 'packing', icon: CheckSquare, label: 'Pack List' },
          { id: 'money', icon: DollarSign, label: 'Money' },
          { id: 'photos', icon: Camera, label: 'Photos' },
          { id: 'settings', icon: Settings, label: 'Settings' },
        ].map(n => (
          <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`}
            onClick={() => { setTab(n.id); setSelectedMarket(null) }}>
            <n.icon size={22} />
            {n.label}
          </button>
        ))}
      </nav>

      {modal?.type === 'market' && (
        <MarketModal data={modal.data} onSave={saveMarket} onClose={() => setModal(null)} products={products} />
      )}
      {modal?.type === 'product' && (
        <ProductModal data={modal.data} onSave={saveProduct} onClose={() => setModal(null)} />
      )}
      {confirm && (
        <div className="confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>{confirm.message}</p>
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirm.onConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  )
}

// ─── Markets Tab ──────────────────────────────────────────
function MarketsTab({ upcoming, past, onSelect, onAdd, getProfit, getVerdict }) {
  const [subTab, setSubTab] = useState('upcoming')
  const list = subTab === 'upcoming' ? upcoming : past

  return (
    <>
      <div className="section-header">
        <h2>Markets</h2>
        <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> Add Market</button>
      </div>

      <div className="tabs">
        <button className={`tab ${subTab === 'upcoming' ? 'active' : ''}`} onClick={() => setSubTab('upcoming')}>
          Upcoming ({upcoming.length})
        </button>
        <button className={`tab ${subTab === 'past' ? 'active' : ''}`} onClick={() => setSubTab('past')}>
          Past ({past.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><CalendarDays size={48} /></div>
          <h3>{subTab === 'upcoming' ? 'No upcoming markets' : 'No past markets yet'}</h3>
          <p>{subTab === 'upcoming' ? 'Add your next market to start tracking' : 'Your market history will show up here'}</p>
          {subTab === 'upcoming' && <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> Add Market</button>}
        </div>
      ) : (
        <div className="card-grid">
          {list.map(m => (
            <div key={m.id} className="card market-card" onClick={() => onSelect(m.id)}>
              <div className="market-card-header">
                <div>
                  <h3>{m.name}</h3>
                  <div className="market-card-date">{fmtDate(m.date)}</div>
                </div>
                {m.date < today() && (
                  <span className={`badge badge-${getVerdict(m) === 'worth' ? 'green' : getVerdict(m) === 'meh' ? 'yellow' : 'red'}`}>
                    {getVerdict(m) === 'worth' ? 'Worth It' : getVerdict(m) === 'meh' ? 'Meh' : 'Skip Next Time'}
                  </span>
                )}
                {m.date >= today() && <span className="badge badge-blue">Upcoming</span>}
              </div>

              {m.location && (
                <div className="market-card-location"><MapPin size={14} /> {m.location}</div>
              )}

              {m.date < today() && (
                <div className="market-card-stats">
                  <div className="market-card-stat">
                    <span>Revenue</span>
                    <span>{fmt(m.revenue || 0)}</span>
                  </div>
                  <div className="market-card-stat">
                    <span>Profit</span>
                    <span style={{ color: getProfit(m) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(getProfit(m))}</span>
                  </div>
                  <div className="market-card-stat">
                    <span>Booth Fee</span>
                    <span>{fmt(m.boothFee || 0)}</span>
                  </div>
                </div>
              )}

              {m.date >= today() && m.boothFee > 0 && (
                <div className="market-card-stats">
                  <div className="market-card-stat">
                    <span>Booth Fee</span>
                    <span>{fmt(m.boothFee)}</span>
                  </div>
                  {m.time && (
                    <div className="market-card-stat">
                      <span>Time</span>
                      <span>{m.time}</span>
                    </div>
                  )}
                </div>
              )}

              {(m.photos || []).length > 0 && (
                <div className="market-card-photos">
                  {m.photos.slice(0, 4).map(p => (
                    <img key={p.id} src={p.url} className="market-card-photo" alt={p.label} />
                  ))}
                  {m.photos.length > 4 && <span className="badge badge-neutral">+{m.photos.length - 4}</span>}
                </div>
              )}

              {m.squareSales && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  <CheckCircle2 size={12} /> Synced from Square
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Market Detail ────────────────────────────────────────
function MarketDetail({ market, onBack, onEdit, onDelete, products, templates, onUpdateMarket, onPhotoUpload, onPhotoDelete, onLightbox, getProfit, getVerdict, square, squareSyncing, onPullSquareSales }) {
  if (!market) return <div className="empty-state"><h3>Market not found</h3><button className="btn btn-secondary" onClick={onBack}>Go Back</button></div>

  const [activeSection, setActiveSection] = useState('overview')
  const isPast = market.date < today()
  const profit = getProfit(market)
  const photoInputRef = useRef(null)
  const [photoLabel, setPhotoLabel] = useState('booth-setup')

  function initPackingList() {
    const template = templates[0]
    if (!template) return
    const list = template.items.map(i => ({ ...i, id: uid(), checked: false }))
    onUpdateMarket({ ...market, packingList: list })
  }

  function togglePackItem(itemId) {
    const list = (market.packingList || []).map(i => i.id === itemId ? { ...i, checked: !i.checked } : i)
    onUpdateMarket({ ...market, packingList: list })
  }

  function addPackItem(text) {
    if (!text.trim()) return
    const list = [...(market.packingList || []), { id: uid(), text: text.trim(), checked: false }]
    onUpdateMarket({ ...market, packingList: list })
  }

  function removePackItem(itemId) {
    const list = (market.packingList || []).filter(i => i.id !== itemId)
    onUpdateMarket({ ...market, packingList: list })
  }

  function toggleProductBrought(productId) {
    const brought = market.productsBrought || []
    const existing = brought.find(b => b.productId === productId)
    if (existing) {
      onUpdateMarket({ ...market, productsBrought: brought.filter(b => b.productId !== productId) })
    } else {
      onUpdateMarket({ ...market, productsBrought: [...brought, { productId, qtyBrought: 0, qtySold: 0, interest: 0 }] })
    }
  }

  function updateProductBrought(productId, field, value) {
    const brought = (market.productsBrought || []).map(b =>
      b.productId === productId ? { ...b, [field]: Number(value) || 0 } : b
    )
    onUpdateMarket({ ...market, productsBrought: brought })
  }

  function updateInterest(productId, interest) {
    const brought = (market.productsBrought || []).map(b =>
      b.productId === productId ? { ...b, interest } : b
    )
    onUpdateMarket({ ...market, productsBrought: brought })
  }

  const packingList = market.packingList || []
  const packedCount = packingList.filter(i => i.checked).length
  const broughtProducts = (market.productsBrought || []).map(b => ({
    ...b,
    product: products.find(p => p.id === b.productId)
  })).filter(b => b.product)

  const squareSales = market.squareSales

  return (
    <>
      <button className="detail-back" onClick={onBack}><ChevronLeft size={18} /> All Markets</button>

      <div className="detail-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>{market.name}</h2>
            <div className="meta">
              <span>{fmtDate(market.date)}</span>
              {market.location && <span><MapPin size={14} style={{ verticalAlign: -2 }} /> {market.location}</span>}
              {market.time && <span><Clock size={14} style={{ verticalAlign: -2 }} /> {market.time}</span>}
              {market.weather && <span className="weather-tag">{market.weather}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {square.connected && (
              <button className="btn btn-secondary btn-sm" onClick={() => onPullSquareSales(market.id)} disabled={squareSyncing}>
                {squareSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {squareSales ? 'Re-sync Square' : 'Pull Square Sales'}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(market)}><Edit3 size={14} /> Edit</button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(market.id)}><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      {isPast && (
        <div className="stats-row">
          <div className="stat-card">
            <div className={`stat-value ${profit >= 0 ? 'green' : 'red'}`}>{fmt(profit)}</div>
            <div className="stat-label">Profit</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(market.revenue || 0)}</div>
            <div className="stat-label">Revenue{squareSales ? ' (Square)' : ''}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent">{fmt((market.boothFee || 0) + (market.gas || 0) + (market.parking || 0) + (market.supplies || 0) + (market.food || 0) + (market.otherExpense || 0))}</div>
            <div className="stat-label">Total Expenses</div>
          </div>
          <div className="stat-card">
            <div className={`stat-value ${getVerdict(market) === 'worth' ? 'green' : getVerdict(market) === 'meh' ? '' : 'red'}`}>
              {getVerdict(market) === 'worth' ? 'Yes' : getVerdict(market) === 'meh' ? 'Meh' : 'No'}
            </div>
            <div className="stat-label">Worth It?</div>
          </div>
        </div>
      )}

      <div className="tabs">
        {['overview', 'packing', 'products', 'photos', 'notes'].map(s => (
          <button key={s} className={`tab ${activeSection === s ? 'active' : ''}`}
            onClick={() => setActiveSection(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {activeSection === 'overview' && (
        <>
          {isPast && (
            <div className="detail-section">
              <div className="detail-section-header"><h3>Money Breakdown</h3></div>
              <div className="card">
                <div className="profit-breakdown">
                  <div className="profit-row">
                    <span className="label">Revenue {squareSales ? '(from Square)' : ''}</span>
                    <span style={{ color: 'var(--green)', fontWeight: 700 }}>+{fmt(market.revenue || 0)}</span>
                  </div>
                  <div className="profit-row"><span className="label">Booth Fee</span><span>-{fmt(market.boothFee || 0)}</span></div>
                  <div className="profit-row"><span className="label">Gas</span><span>-{fmt(market.gas || 0)}</span></div>
                  {(market.parking || 0) > 0 && <div className="profit-row"><span className="label">Parking</span><span>-{fmt(market.parking)}</span></div>}
                  {(market.supplies || 0) > 0 && <div className="profit-row"><span className="label">Supplies</span><span>-{fmt(market.supplies)}</span></div>}
                  {(market.food || 0) > 0 && <div className="profit-row"><span className="label">Food</span><span>-{fmt(market.food)}</span></div>}
                  {(market.otherExpense || 0) > 0 && <div className="profit-row"><span className="label">Other</span><span>-{fmt(market.otherExpense)}</span></div>}
                  <div className="profit-row total">
                    <span>Profit</span>
                    <span style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(profit)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Square Sales Breakdown */}
          {squareSales && squareSales.itemsSold && squareSales.itemsSold.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-header">
                <h3>Square Sales Breakdown</h3>
                <span className="badge badge-green" style={{ gap: 4 }}><CheckCircle2 size={10} /> {squareSales.orderCount} orders</span>
              </div>
              <div className="card">
                {squareSales.itemsSold.map((item, i) => (
                  <div key={i} className="list-item-row">
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Qty: {item.quantity}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(item.revenue)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isPast && (
            <div className="detail-section">
              <div className="detail-section-header"><h3>Market Info</h3></div>
              <div className="card">
                <div className="profit-breakdown">
                  <div className="profit-row"><span className="label">Booth Fee</span><span>{fmt(market.boothFee || 0)}</span></div>
                  {market.time && <div className="profit-row"><span className="label">Time</span><span>{market.time}</span></div>}
                  {market.indoorOutdoor && <div className="profit-row"><span className="label">Type</span><span>{market.indoorOutdoor}</span></div>}
                </div>
              </div>
            </div>
          )}

          {broughtProducts.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-header"><h3>Top Interest</h3></div>
              <div className="card">
                {broughtProducts.sort((a,b) => (b.interest || 0) - (a.interest || 0)).slice(0, 5).map(bp => (
                  <div key={bp.productId} className="interest-bar">
                    <span className="interest-label">{bp.product.name}</span>
                    <div className="interest-fill">
                      <div className="interest-fill-inner" style={{ width: `${Math.min((bp.interest || 0) * 10, 100)}%` }} />
                    </div>
                    <span className="interest-count">{bp.interest || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(market.photos || []).length > 0 && (
            <div className="detail-section">
              <div className="detail-section-header"><h3>Photos</h3></div>
              <div className="photo-grid">
                {market.photos.slice(0, 4).map(p => (
                  <div key={p.id} className="photo-item" onClick={() => onLightbox(p.url)}>
                    <img src={p.url} alt={p.label} />
                    <div className="photo-item-label">{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeSection === 'packing' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3>Packing List ({packedCount}/{packingList.length})</h3>
            {packingList.length === 0 && (
              <button className="btn btn-secondary btn-sm" onClick={initPackingList}>
                <Plus size={14} /> Load Template
              </button>
            )}
          </div>
          <div className="card">
            {packingList.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>
                <p>No packing list yet. Load a template or add items.</p>
              </div>
            ) : (
              <ul className="checklist">
                {packingList.map(item => (
                  <li key={item.id} className="checklist-item">
                    <div className={`checklist-checkbox ${item.checked ? 'checked' : ''}`}
                      onClick={() => togglePackItem(item.id)}>
                      {item.checked && <Check size={14} />}
                    </div>
                    <span className={`checklist-item-text ${item.checked ? 'checked' : ''}`}>{item.text}</span>
                    <div className="checklist-item-actions">
                      <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => removePackItem(item.id)}>
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <AddItemInput onAdd={addPackItem} placeholder="Add item..." />
          </div>
        </div>
      )}

      {activeSection === 'products' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3>Products ({broughtProducts.length})</h3>
          </div>

          {products.length === 0 ? (
            <div className="empty-state">
              <h3>No products yet</h3>
              <p>Add products in the Products tab first, then select which ones you're bringing.</p>
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="detail-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 13 }}>Select Products to Bring</h3>
                </div>
                {products.map(p => {
                  const isBrought = (market.productsBrought || []).some(b => b.productId === p.id)
                  return (
                    <div key={p.id} className="checklist-item" style={{ borderColor: 'var(--border)' }}>
                      <div className={`checklist-checkbox ${isBrought ? 'checked' : ''}`}
                        onClick={() => toggleProductBrought(p.id)}>
                        {isBrought && <Check size={14} />}
                      </div>
                      <span className="checklist-item-text">
                        {p.name}
                        {p.squareId && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>(Square)</span>}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-dark)' }}>{fmt(p.price)}</span>
                    </div>
                  )
                })}
              </div>

              {broughtProducts.length > 0 && (
                <div className="card">
                  <div className="detail-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 13 }}>Track Quantities & Interest</h3>
                  </div>
                  {broughtProducts.map(bp => (
                    <div key={bp.productId} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>{bp.product.name}</div>
                      <div className="form-row">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: 11 }}>Brought</label>
                          <input type="number" className="form-input" value={bp.qtyBrought || ''}
                            onChange={e => updateProductBrought(bp.productId, 'qtyBrought', e.target.value)}
                            placeholder="0" min="0" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: 11 }}>Sold</label>
                          <input type="number" className="form-input" value={bp.qtySold || ''}
                            onChange={e => updateProductBrought(bp.productId, 'qtySold', e.target.value)}
                            placeholder="0" min="0" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: 11 }}>Interest (1-10)</label>
                          <input type="number" className="form-input" value={bp.interest || ''}
                            onChange={e => updateInterest(bp.productId, Math.min(10, Math.max(0, Number(e.target.value))))}
                            placeholder="0" min="0" max="10" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeSection === 'photos' && (
        <div className="detail-section">
          <div className="detail-section-header"><h3>Photos</h3></div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['car-packed', 'booth-setup', 'display', 'crowd', 'end-of-day', 'other'].map(label => (
              <button key={label} className={`btn btn-sm ${photoLabel === label ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPhotoLabel(label)}>
                {label.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>

          <div className="photo-grid">
            <label className="photo-upload">
              <Camera size={24} />
              <span>Add {photoLabel.split('-').join(' ')}</span>
              <input type="file" accept="image/*" capture="environment"
                onChange={e => onPhotoUpload(e, market.id, photoLabel)}
                ref={photoInputRef} />
            </label>

            {(market.photos || []).map(p => (
              <div key={p.id} className="photo-item">
                <img src={p.url} alt={p.label} onClick={() => onLightbox(p.url)} />
                <div className="photo-item-label">{p.label}</div>
                <button
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, padding: 4, color: 'white', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onPhotoDelete(market.id, p.id) }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'notes' && (
        <div className="detail-section">
          <div className="detail-section-header"><h3>Notes</h3></div>
          <div className="card">
            <textarea
              className="form-input"
              style={{ minHeight: 200 }}
              value={market.notes || ''}
              onChange={e => onUpdateMarket({ ...market, notes: e.target.value })}
              placeholder="How was it? What would you do differently? Parking situation? Weather? Slow/busy times? Anything you want to remember for next time..."
            />
          </div>
        </div>
      )}
    </>
  )
}

// ─── Products Tab ─────────────────────────────────────────
function ProductsTab({ products, onAdd, onEdit, onDelete, square, squareSyncing, onSyncSquare }) {
  const [search, setSearch] = useState('')
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="section-header">
        <h2>Products</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {square.connected && (
            <button className="btn btn-secondary" onClick={onSyncSquare} disabled={squareSyncing}>
              {squareSyncing ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              Sync Square
            </button>
          )}
          <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> Add Product</button>
        </div>
      </div>

      {products.length > 3 && (
        <div className="search-bar">
          <Search size={18} />
          <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {filtered.length === 0 && products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={48} /></div>
          <h3>No products yet</h3>
          <p>
            Add the products you sell at markets.
            {square.connected && ' Or sync your products from Square.'}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> Add Product</button>
            {square.connected && (
              <button className="btn btn-secondary" onClick={onSyncSquare} disabled={squareSyncing}>
                {squareSyncing ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                Import from Square
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map(p => (
            <div key={p.id} className="card">
              <div className="product-card">
                <div className="product-thumb">
                  {p.image ? <img src={p.image} alt={p.name} /> : <Package size={24} />}
                </div>
                <div className="product-info">
                  <h4>
                    {p.name}
                    {p.squareId && (
                      <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                        <Link2 size={10} /> Square
                      </span>
                    )}
                  </h4>
                  <div className="product-meta">
                    {p.category && <span>{p.category}</span>}
                    {p.category && p.stock !== undefined && <span> &middot; </span>}
                    {p.stock !== undefined && <span>{p.stock} in stock</span>}
                  </div>
                </div>
                <div className="product-price">{fmt(p.price)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onEdit(p)}><Edit3 size={14} /> Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(p.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Packing Tab ──────────────────────────────────────────
function PackingTab({ templates, setTemplates }) {
  const [editingTemplate, setEditingTemplate] = useState(null)

  function addTemplate() {
    const t = { id: uid(), name: 'New List', items: [] }
    setTemplates(prev => [...prev, t])
    setEditingTemplate(t.id)
  }

  function renameTemplate(id, name) {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, name } : t))
  }

  function addItem(templateId, text) {
    if (!text.trim()) return
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, items: [...t.items, { id: uid(), text: text.trim(), checked: false }] } : t
    ))
  }

  function removeItem(templateId, itemId) {
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t
    ))
  }

  function toggleItem(templateId, itemId) {
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, items: t.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) } : t
    ))
  }

  function deleteTemplate(id) {
    if (templates.length <= 1) return
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <>
      <div className="section-header">
        <h2>Pack Lists</h2>
        <button className="btn btn-primary" onClick={addTemplate}><Plus size={18} /> New List</button>
      </div>

      <div className="card-grid">
        {templates.map(t => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              {editingTemplate === t.id ? (
                <input className="form-input" style={{ fontSize: 18, fontWeight: 700, padding: '4px 8px' }}
                  value={t.name} onChange={e => renameTemplate(t.id, e.target.value)}
                  onBlur={() => setEditingTemplate(null)} onKeyDown={e => e.key === 'Enter' && setEditingTemplate(null)}
                  autoFocus />
              ) : (
                <h3 style={{ fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setEditingTemplate(t.id)}>{t.name}</h3>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => setEditingTemplate(t.id)}>
                  <Edit3 size={14} />
                </button>
                {templates.length > 1 && (
                  <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => deleteTemplate(t.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            <ul className="checklist">
              {t.items.map(item => (
                <li key={item.id} className="checklist-item">
                  <div className={`checklist-checkbox ${item.checked ? 'checked' : ''}`}
                    onClick={() => toggleItem(t.id, item.id)}>
                    {item.checked && <Check size={14} />}
                  </div>
                  <span className={`checklist-item-text ${item.checked ? 'checked' : ''}`}>{item.text}</span>
                  <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => removeItem(t.id, item.id)}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <AddItemInput onAdd={(text) => addItem(t.id, text)} placeholder="Add item..." />
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-tertiary)' }}>
              {t.items.length} items
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Money Tab ────────────────────────────────────────────
function MoneyTab({ markets, totalRevenue, totalProfit, totalMarkets, getProfit, getVerdict, onSelect }) {
  const avgProfit = totalMarkets > 0 ? totalProfit / totalMarkets : 0
  const bestMarket = markets.length > 0 ? markets.reduce((best, m) => getProfit(m) > getProfit(best) ? m : best, markets[0]) : null
  const worstMarket = markets.length > 0 ? markets.reduce((worst, m) => getProfit(m) < getProfit(worst) ? m : worst, markets[0]) : null

  return (
    <>
      <div className="section-header"><h2>Money</h2></div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{fmt(totalRevenue)}</div>
          <div className="stat-label">Total Revenue</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${totalProfit >= 0 ? 'green' : 'red'}`}>{fmt(totalProfit)}</div>
          <div className="stat-label">Total Profit</div>
        </div>
        <div className="stat-card">
          <div className="stat-value accent">{totalMarkets}</div>
          <div className="stat-label">Markets Done</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${avgProfit >= 0 ? 'green' : 'red'}`}>{fmt(avgProfit)}</div>
          <div className="stat-label">Avg Profit</div>
        </div>
      </div>

      {bestMarket && (
        <div className="card-grid" style={{ marginBottom: 20 }}>
          <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              <TrendingUp size={14} style={{ verticalAlign: -2 }} /> Best Market
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{bestMarket.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtShort(bestMarket.date)} &middot; Profit: <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(getProfit(bestMarket))}</span></div>
          </div>
          {worstMarket && worstMarket.id !== bestMarket.id && (
            <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                <TrendingDown size={14} style={{ verticalAlign: -2 }} /> Worst Market
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{worstMarket.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtShort(worstMarket.date)} &middot; Profit: <span style={{ color: 'var(--red)', fontWeight: 700 }}>{fmt(getProfit(worstMarket))}</span></div>
            </div>
          )}
        </div>
      )}

      {markets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><DollarSign size={48} /></div>
          <h3>No market data yet</h3>
          <p>Complete a market and log your revenue and expenses to start tracking your money.</p>
        </div>
      ) : (
        <div className="card">
          <div className="detail-section-header" style={{ borderBottom: 'none', marginBottom: 0 }}>
            <h3>All Markets</h3>
          </div>
          {markets.map(m => {
            const p = getProfit(m)
            return (
              <div key={m.id} className="list-item-row" style={{ cursor: 'pointer' }} onClick={() => onSelect(m.id)}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {fmtShort(m.date)}
                    {m.squareSales && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }}><CheckCircle2 size={10} style={{ verticalAlign: -1 }} /> Square</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: p >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(p)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>rev {fmt(m.revenue || 0)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Photos Tab ───────────────────────────────────────────
function PhotosTab({ markets, onSelect, onLightbox }) {
  const allPhotos = markets.flatMap(m => (m.photos || []).map(p => ({ ...p, marketId: m.id, marketName: m.name, marketDate: m.date })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <>
      <div className="section-header"><h2>Photos</h2></div>

      {allPhotos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Camera size={48} /></div>
          <h3>No photos yet</h3>
          <p>Take photos of your car packed up, your booth setup, your display layout. It all gets saved to each market.</p>
        </div>
      ) : (
        <div className="photo-grid">
          {allPhotos.map(p => (
            <div key={p.id} className="photo-item" onClick={() => onLightbox(p.url)}>
              <img src={p.url} alt={p.label} />
              <div className="photo-item-label">
                {p.label}<br />
                <span style={{ opacity: 0.7 }}>{p.marketName}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Settings Tab ─────────────────────────────────────────
function SettingsTab({ square, syncing, onConnect, onDisconnect, products, onSyncProducts }) {
  const squareProductCount = products.filter(p => p.squareId).length

  return (
    <>
      <div className="section-header"><h2>Settings</h2></div>

      {/* Square Integration */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, background: '#1A1A1A', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="4" fill="white"/>
              <rect x="7" y="7" width="10" height="10" rx="2" fill="#1A1A1A"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Square</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Sync your products and pull sales data automatically
            </p>
          </div>
          {square.connected ? (
            <span className="badge badge-green"><CheckCircle2 size={12} /> Connected</span>
          ) : (
            <span className="badge badge-neutral">Not Connected</span>
          )}
        </div>

        {square.connected ? (
          <>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Merchant ID</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace' }}>{square.merchant || 'Connected'}</div>
              {squareProductCount > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {squareProductCount} product{squareProductCount !== 1 ? 's' : ''} synced from Square
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={onSyncProducts} disabled={syncing}>
                {syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                Sync Products
              </button>
              <button className="btn btn-danger" onClick={onDisconnect}>
                <Unlink size={16} /> Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Connect your Square account to:
              </div>
              <ul style={{ margin: '8px 0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <li>Import your product catalog automatically</li>
                <li>Pull sales data for each market day</li>
                <li>See exactly what sold and how much you made</li>
                <li>No more manually entering revenue</li>
              </ul>
            </div>

            <button className="btn btn-primary" onClick={onConnect} disabled={syncing}>
              {syncing ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />}
              Connect Square
            </button>
          </>
        )}
      </div>

      {/* Future integrations placeholder */}
      <div className="card" style={{ opacity: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, background: 'var(--surface)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
            <ShoppingBag size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Shopify</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Coming soon
            </p>
          </div>
          <span className="badge badge-neutral">Soon</span>
        </div>
      </div>
    </>
  )
}

// ─── Market Modal ─────────────────────────────────────────
function MarketModal({ data, onSave, onClose, products }) {
  const [form, setForm] = useState(data || {
    name: '', date: '', location: '', time: '', boothFee: '',
    indoorOutdoor: '', weather: '', revenue: '', gas: '', parking: '',
    supplies: '', food: '', otherExpense: '', notes: ''
  })
  const isEdit = !!data?.id

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.date) return
    onSave({
      ...form,
      boothFee: Number(form.boothFee) || 0,
      revenue: Number(form.revenue) || 0,
      gas: Number(form.gas) || 0,
      parking: Number(form.parking) || 0,
      supplies: Number(form.supplies) || 0,
      food: Number(form.food) || 0,
      otherExpense: Number(form.otherExpense) || 0,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Market' : 'Add Market'}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Market Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Old Town Farmers Market" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Time</label>
                <input className="form-input" value={form.time || ''} onChange={e => setForm({ ...form, time: e.target.value })}
                  placeholder="9am - 2pm" />
              </div>
            </div>
            <div className="form-group">
              <label>Location</label>
              <input className="form-input" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="123 Main St, Scottsdale AZ" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Indoor / Outdoor</label>
                <select className="form-input" value={form.indoorOutdoor || ''} onChange={e => setForm({ ...form, indoorOutdoor: e.target.value })}>
                  <option value="">Select</option>
                  <option value="Indoor">Indoor</option>
                  <option value="Outdoor">Outdoor</option>
                  <option value="Both">Both</option>
                </select>
              </div>
              <div className="form-group">
                <label>Weather</label>
                <input className="form-input" value={form.weather || ''} onChange={e => setForm({ ...form, weather: e.target.value })}
                  placeholder="85F, Sunny" />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0', paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                Expenses
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Booth Fee</label>
                <input type="number" className="form-input" value={form.boothFee || ''} onChange={e => setForm({ ...form, boothFee: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>Gas</label>
                <input type="number" className="form-input" value={form.gas || ''} onChange={e => setForm({ ...form, gas: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Parking</label>
                <input type="number" className="form-input" value={form.parking || ''} onChange={e => setForm({ ...form, parking: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>Food</label>
                <input type="number" className="form-input" value={form.food || ''} onChange={e => setForm({ ...form, food: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Supplies</label>
                <input type="number" className="form-input" value={form.supplies || ''} onChange={e => setForm({ ...form, supplies: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>Other Expense</label>
                <input type="number" className="form-input" value={form.otherExpense || ''} onChange={e => setForm({ ...form, otherExpense: e.target.value })}
                  placeholder="0" min="0" step="0.01" />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0', paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                Revenue
              </div>
            </div>

            <div className="form-group">
              <label>Total Revenue</label>
              <input type="number" className="form-input" value={form.revenue || ''} onChange={e => setForm({ ...form, revenue: e.target.value })}
                placeholder="0" min="0" step="0.01" />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-input" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="How was it? Parking tips? Best time of day? Anything to remember..." />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Add Market'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Product Modal ────────────────────────────────────────
function ProductModal({ data, onSave, onClose }) {
  const [form, setForm] = useState(data || { name: '', price: '', category: '', stock: '', image: '' })
  const isEdit = !!data?.id

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setForm({ ...form, image: ev.target.result })
    reader.readAsDataURL(file)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.price) return
    onSave({ ...form, price: Number(form.price), stock: form.stock ? Number(form.stock) : undefined })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Product' : 'Add Product'}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <label style={{ width: 80, height: 80, borderRadius: 'var(--radius-sm)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', flexShrink: 0 }}>
                {form.image ? (
                  <img src={form.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Image size={24} color="var(--text-tertiary)" />
                )}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </label>
              <div style={{ flex: 1 }}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Lavender Candle" required />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Price *</label>
                <input type="number" className="form-input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                  placeholder="25.00" required min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>Stock</label>
                <input type="number" className="form-input" value={form.stock || ''} onChange={e => setForm({ ...form, stock: e.target.value })}
                  placeholder="Optional" min="0" />
              </div>
            </div>
            <div className="form-group">
              <label>Category</label>
              <input className="form-input" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Candles, Jewelry, Prints..." />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Add Product'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reusable Add Item Input ──────────────────────────────
function AddItemInput({ onAdd, placeholder }) {
  const [text, setText] = useState('')
  return (
    <div className="checklist-add">
      <Plus size={18} color="var(--text-tertiary)" />
      <input value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text); setText('') } }}
        placeholder={placeholder} />
      {text.trim() && (
        <button className="btn btn-primary btn-sm" onClick={() => { onAdd(text); setText('') }}>Add</button>
      )}
    </div>
  )
}

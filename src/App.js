import { useState, useEffect } from 'react'
import logoIDR from './assets/logo-idr.png'
import { supabase } from './lib/supabase'
import { exportarTodo } from './lib/export'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import ClienteFicha from './pages/ClienteFicha'
import Planificacion from './pages/Planificacion'
import Sesiones from './pages/Sesiones'
import Biblioteca from './pages/Biblioteca'
import Agenda from './pages/Agenda'
import SesionPublica from './pages/SesionPublica'
import Login from './pages/Login'
import PackPublico from './pages/PackPublico'
import ClientePortal from './pages/ClientePortal'
import CuestionarioInicial from './pages/CuestionarioInicial'
import RestablecerContrasena from './pages/RestablecerContrasena'
import StravaCallback from './pages/StravaCallback'
import './index.css'

const NAV = [
  { id: 'agenda',        label: 'Mi espacio',  icon: AgendaIcon },
  { id: 'clientes',      label: 'Clientes',    icon: UsersIcon },
  { id: 'planificacion', label: 'Planificación', icon: CalendarIcon },
  { id: 'biblioteca',    label: 'Biblioteca',  icon: BookIcon },
  { id: 'dashboard',     label: 'Dashboard',   icon: HomeIcon },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [page, setPage] = useState('agenda')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [clientePlanificacion, setClientePlanificacion] = useState(null)
  const [clienteFichaId, setClienteFichaId] = useState(null)
  const [sesionesContext, setSesionesContext] = useState({ clienteId: null, sesionId: null })
  const [recargarPlan, setRecargarPlan] = useState(0)
  const [planificacionFechaInicial, setPlanificacionFechaInicial] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [publicSesionToken, setPublicSesionToken] = useState(null)
  const [publicPackToken, setPublicPackToken] = useState(null)
  const [publicClienteToken, setPublicClienteToken] = useState(null)
  const [publicCuestionarioToken, setPublicCuestionarioToken] = useState(null)
  const [stravaCallbackParams, setStravaCallbackParams] = useState(null)
  useEffect(() => {
    const path = window.location.pathname
    if (path.startsWith('/restablecer-contrasena')) {
      setAuthLoading(false)
      return
    }
   const matchSesion = path.match(/^\/sesion\/([a-f0-9-]+)$/)
    if (matchSesion) {
      setPublicSesionToken(matchSesion[1])
      setAuthLoading(false)
      return
    }
    // El check-in semanal ya no existe: los enlaces antiguos llevan al portal.
    const matchCheckinPortal = path.match(/^\/checkin-portal\/([^/?]+)/)
    if (matchCheckinPortal) {
      window.location.replace(`/cliente/${matchCheckinPortal[1]}`)
      return
    }
    const matchPack = path.match(/^\/pack\/([a-f0-9-]+)$/)
    if (matchPack) {
      setPublicPackToken(matchPack[1])
      setAuthLoading(false)
      return
    }
    const matchCliente = path.match(/^\/cliente\/(.+)$/)
    if (matchCliente) {
      setPublicClienteToken(matchCliente[1])
      setAuthLoading(false)
      return
    }
    const matchCuestionario = path.match(/^\/cuestionario\/(.+)$/)
    if (matchCuestionario) {
      setPublicCuestionarioToken(matchCuestionario[1])
      setAuthLoading(false)
      return
    }

    // Callback de OAuth Strava — llega tras autorizar en strava.com
    if (path === '/strava/callback') {
      const sp = new URLSearchParams(window.location.search)
      setStravaCallbackParams({
        code:  sp.get('code'),
        state: sp.get('state'),
        error: sp.get('error'),
      })
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (page !== 'clientes') setClienteFichaId(null) }, [page])

  if (authLoading) return null

 // Vista pública
  if (window.location.pathname.startsWith('/restablecer-contrasena')) return <RestablecerContrasena />
  if (stravaCallbackParams) return <StravaCallback params={stravaCallbackParams} />
 if (publicSesionToken) return <SesionPublica token={publicSesionToken} />
  if (publicPackToken) return <PackPublico token={publicPackToken} />
  if (publicClienteToken) return <ClientePortal token={publicClienteToken} />
  if (publicCuestionarioToken) return <CuestionarioInicial token={publicCuestionarioToken} />
  if (!session) return <Login />

 return (
    <div className="app-layout">
      <button
        onClick={() => setSidebarOpen(o => !o)}
        title={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
        style={{
          position: 'fixed', top: 14, left: sidebarOpen ? 178 : 10,
          zIndex: 200, width: 28, height: 28,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          transition: 'left 0.22s ease', color: 'var(--text2)', fontSize: 14
        }}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>
      <aside className="sidebar" style={{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-220px)', transition: 'transform 0.22s ease' }}>
        <div className="sidebar-logo" style={{ padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <img src={logoIDR} alt="IDR IdelRi" style={{ width: 90, display: 'block', objectFit: 'contain' }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#789B8A', background: 'rgba(120,155,138,0.13)', padding: '2px 5px', borderRadius: 3, fontFamily: 'sans-serif', marginBottom: 4 }}>app</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-ghost btn-sm w-full" style={{ justifyContent: 'center', marginBottom: 8 }} onClick={exportarTodo}>
            ↓ Exportar CSV
          </button>
          <button className="btn btn-ghost btn-sm w-full" style={{ justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}
            onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main" style={{ marginLeft: sidebarOpen ? 220 : 0, transition: 'margin-left 0.22s ease' }}>
        {page === 'dashboard'      && <Dashboard setPage={setPage} setClientePlanificacion={setClientePlanificacion} clientePlanificacion={clientePlanificacion} />}
        {page === 'clientes' && !clienteFichaId && <Clientes setPage={setPage} setClientePlanificacion={setClientePlanificacion} clientePlanificacion={clientePlanificacion} onAbrirFicha={setClienteFichaId} />}
        {page === 'clientes' && clienteFichaId && <ClienteFicha clienteId={clienteFichaId} onVolver={() => setClienteFichaId(null)} setPage={setPage} setClientePlanificacion={setClientePlanificacion} />}
        {page === 'planificacion'  && <Planificacion setPage={setPage} setClientePlanificacion={setClientePlanificacion} clientePlanificacion={clientePlanificacion} setSesionesContext={setSesionesContext} recargarPlan={recargarPlan} planificacionFechaInicial={planificacionFechaInicial} setPlanificacionFechaInicial={setPlanificacionFechaInicial} />}
        {page === 'sesiones'       && <Sesiones clienteInicial={sesionesContext.clienteId} sesionInicialId={sesionesContext.sesionId} fechaNuevaSesion={sesionesContext.fechaNueva} esPlantilla={sesionesContext.esPlantilla} setPage={setPage} setClientePlanificacion={setClientePlanificacion} setRecargarPlan={setRecargarPlan} />}
        {page === 'biblioteca'     && <Biblioteca setPage={setPage} setSesionesContext={setSesionesContext} />}
        {page === 'agenda'         && <Agenda setPage={setPage} setSesionesContext={setSesionesContext} setClientePlanificacion={setClientePlanificacion} setPlanificacionFechaInicial={setPlanificacionFechaInicial} />}
      </main>
    </div>
  )
}

function HomeIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function UsersIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
}
function EuroIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 8.5a4 4 0 100 7"/><line x1="7" y1="12" x2="14" y2="12"/><line x1="7" y1="15" x2="13" y2="15"/></svg>
}
function CheckIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
}
function CalendarIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function BookIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
}
function AgendaIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/></svg>
}

/**
 * Pop-ups propios para toda la app: sustituye el tooltip gris del navegador (atributo `title`)
 * por una tarjeta con el estilo de idelri. No hace falta tocar los componentes: al pasar el
 * ratón, el `title` se guarda en `data-tip` y se muestra aquí.
 *   - Primera línea en negrita si hay varias; una línea vacía separa bloques.
 */
let instalado = false

export function instalarTooltips() {
  if (instalado || typeof document === 'undefined') return
  instalado = true

  const tip = document.createElement('div')
  tip.setAttribute('role', 'tooltip')
  tip.className = 'idr-tip'
  document.body.appendChild(tip)
  const st = document.createElement('style')
  st.textContent = `
  .idr-tip{position:fixed;z-index:10000;max-width:300px;padding:8px 11px;border-radius:9px;background:var(--surface,#fff);color:var(--text,#1f2a24);
    border:1px solid var(--border,#e5e7eb);box-shadow:0 8px 24px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.06);font:12px/1.45 var(--font,-apple-system,BlinkMacSystemFont,sans-serif);
    pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s;white-space:normal;overflow-wrap:anywhere}
  .idr-tip.on{opacity:1;transform:none}
  .idr-tip .t{font-weight:700;font-size:12.5px;color:var(--text,#1f2a24)}
  .idr-tip .l{color:var(--text2,#4b5563)}
  .idr-tip .s{height:6px}`
  document.head.appendChild(st)

  let actual = null, timer = null
  const esc = x => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const pintar = texto => {
    const lineas = texto.split('\n')
    const varias = lineas.filter(Boolean).length > 1
    tip.innerHTML = lineas.map((l, i) => !l.trim() ? '<div class="s"></div>' : `<div class="${i === 0 && varias ? 't' : 'l'}">${esc(l)}</div>`).join('')
  }
  const colocar = el => {
    const r = el.getBoundingClientRect()
    const w = tip.offsetWidth, h = tip.offsetHeight
    let x = r.left + r.width / 2 - w / 2
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8))
    let y = r.bottom + 8
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8)
    tip.style.left = x + 'px'; tip.style.top = y + 'px'
  }
  const ocultar = () => { clearTimeout(timer); tip.classList.remove('on'); actual = null }
  const mostrar = el => {
    const t = el.getAttribute('data-tip')
    if (!t || !document.body.contains(el)) return
    pintar(t); tip.style.left = '-9999px'; tip.style.top = '0'
    colocar(el); tip.classList.add('on')
  }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[title],[data-tip]')
    if (!el || el.tagName === 'IFRAME' || el.ownerSVGElement) return
    if (el.hasAttribute('title')) {
      const t = el.getAttribute('title')
      el.removeAttribute('title')
      if (t) el.setAttribute('data-tip', t); else el.removeAttribute('data-tip')
    }
    if (el === actual) return
    clearTimeout(timer); tip.classList.remove('on')
    actual = el
    if (!el.getAttribute('data-tip')) return
    timer = setTimeout(() => { if (actual === el) mostrar(el) }, 280)
  }, true)
  document.addEventListener('mouseout', e => {
    if (!actual) return
    if (e.relatedTarget && actual.contains(e.relatedTarget)) return
    if (e.target === actual || actual.contains(e.target)) ocultar()
  }, true)
  ;['mousedown', 'scroll', 'dragstart', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, ocultar, true))
  window.addEventListener('blur', ocultar)
}

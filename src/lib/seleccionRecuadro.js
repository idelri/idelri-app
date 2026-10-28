/**
 * Selección por recuadro: pulsa en un hueco vacío y arrastra para dibujar un
 * rectángulo; al soltar se seleccionan todos los elementos con [data-selk] que toca.
 * Con Mayús o Ctrl/⌘ se suman a la selección que ya había.
 */
import { useEffect, useRef } from 'react'

const IGNORAR = '[draggable="true"],[data-selk],[data-no-recuadro],button,input,textarea,select,a,label,[contenteditable="true"],.tl-estirar,.tl-asa'

function corta(a, b) { return a.width > 0 && a.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top }

export function useSeleccionRecuadro(ref, activo, onSeleccion) {
  const cb = useRef(onSeleccion)
  cb.current = onSeleccion
  useEffect(() => {
    const raiz = ref.current
    if (!raiz || !activo) return
    let ini = null, caja = null, marcados = []
    const rectDe = e => ({ left: Math.min(ini.x, e.clientX), top: Math.min(ini.y, e.clientY), right: Math.max(ini.x, e.clientX), bottom: Math.max(ini.y, e.clientY) })
    const desmarcar = () => { marcados.forEach(n => n.classList.remove('sel-recuadro')); marcados = [] }
    const tocados = r => [...raiz.querySelectorAll('[data-selk]')].filter(n => corta(n.getBoundingClientRect(), r))
    function mover(e) {
      if (!ini) return
      if (!caja) {
        if (Math.hypot(e.clientX - ini.x, e.clientY - ini.y) < 6) return
        caja = document.createElement('div')
        caja.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;border:1.5px solid var(--accent,#2d6a4f);background:rgba(45,106,79,.08);border-radius:4px'
        document.body.appendChild(caja)
        document.body.style.userSelect = 'none'
        window.getSelection()?.removeAllRanges()
      }
      const r = rectDe(e)
      Object.assign(caja.style, { left: r.left + 'px', top: r.top + 'px', width: r.right - r.left + 'px', height: r.bottom - r.top + 'px' })
      desmarcar(); marcados = tocados(r); marcados.forEach(n => n.classList.add('sel-recuadro'))
    }
    function soltar(e) {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      if (caja) {
        const claves = [...new Set(tocados(rectDe(e)).map(n => n.dataset.selk))]
        caja.remove(); caja = null; desmarcar(); document.body.style.userSelect = ''
        // el clic que llega justo después de soltar no debe deshacer la selección
        const parar = ev => { ev.stopPropagation(); ev.preventDefault() }
        window.addEventListener('click', parar, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', parar, { capture: true }), 0)
        cb.current?.(claves, ini.sumar)
      }
      ini = null
    }
    function bajar(e) {
      if (e.button !== 0 || e.target.closest(IGNORAR)) return
      ini = { x: e.clientX, y: e.clientY, sumar: e.shiftKey || e.metaKey || e.ctrlKey }
      window.addEventListener('mousemove', mover)
      window.addEventListener('mouseup', soltar)
    }
    raiz.addEventListener('mousedown', bajar)
    return () => {
      raiz.removeEventListener('mousedown', bajar)
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      if (caja) { caja.remove(); document.body.style.userSelect = '' }
      desmarcar()
    }
  }, [ref, activo])
}

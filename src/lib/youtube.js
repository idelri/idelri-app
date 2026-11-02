// Los enlaces de YouTube Shorts no se ven en las miniaturas ni en el
// reproductor de la app: se guardan siempre como enlace normal (watch?v=).
export function normalizarYoutube(url) {
  if (!url || typeof url !== 'string') return url
  const m = url.trim().match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i)
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : url
}

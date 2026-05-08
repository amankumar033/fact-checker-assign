function formatErrorDetail(data, status) {
  if (!data?.detail) return `Request failed (${status}).`
  const d = data.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d.map((e) => e?.msg || JSON.stringify(e)).join('; ')
  }
  try {
    return JSON.stringify(d)
  } catch {
    return `Request failed (${status}).`
  }
}

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {File} opts.file
 * @param {(n: number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs] — must exceed backend fact-check deadline (default 125s)
 */
export function uploadPdfWithProgress({ url, file, onProgress, signal, timeoutMs = 125000 }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.timeout = timeoutMs

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const pct = Math.round((event.loaded / event.total) * 100)
      onProgress?.(pct)
    }
    xhr.upload.onload = () => onProgress?.(100)

    xhr.onerror = () => reject(new Error('Network error while uploading. Is the API running?'))
    xhr.onabort = () => reject(new Error('Upload aborted.'))
    xhr.ontimeout = () =>
      reject(
        new Error(
          'Request timed out. The server may be unreachable, overloaded, or missing API keys (Groq/Tavily). Check the terminal running the backend.',
        ),
      )

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return
      const isOk = xhr.status >= 200 && xhr.status < 300
      let data
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        data = null
      }
      if (!isOk) {
        reject(new Error(formatErrorDetail(data, xhr.status)))
        return
      }
      resolve(data)
    }

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    const formData = new FormData()
    formData.append('file', file)
    xhr.send(formData)
  })
}

import { useEffect, useState } from 'react'

type ToastMessage = { id: number; text: string }

let nextId = 1
let listener: ((message: ToastMessage) => void) | null = null

export function toast(text: string) {
  listener?.({ id: nextId, text })
  nextId += 1
}

export function Toaster() {
  const [message, setMessage] = useState<ToastMessage | null>(null)

  useEffect(() => {
    listener = setMessage
    return () => {
      listener = null
    }
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 6000)
    return () => window.clearTimeout(timer)
  }, [message])

  if (!message) return null
  return (
    <div className="toast" role="status">
      {message.text}
    </div>
  )
}

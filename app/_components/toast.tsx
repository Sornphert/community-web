'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { Check, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; type: ToastType }

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

// Lightweight app-wide toasts. Mounted once in the root layout; any client
// component can call useToast().showToast('Saved', 'success'). Auto-dismiss after
// a few seconds; stacked bottom-center (above the mobile tab bar).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((cur) => [...cur, { id, message, type }])
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id))
      }, 3500)
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-lg"
          >
            {t.type === 'success' && (
              <Check className="h-4 w-4 shrink-0 text-success-text" />
            )}
            {t.type === 'error' && (
              <X className="h-4 w-4 shrink-0 text-danger-text" />
            )}
            {t.type === 'info' && (
              <Info className="h-4 w-4 shrink-0 text-fg-muted" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Safe no-op fallback if used outside the provider (keeps components resilient).
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  return ctx ?? { showToast: () => {} }
}

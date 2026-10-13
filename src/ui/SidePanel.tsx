import { X } from "@phosphor-icons/react"
import { type ReactNode, useEffect, useRef } from "react"

// Slide-over used by the workstream and product area panels.
export const SidePanel = ({ title, subtitle, badge, onClose, children, labelId, size }: {
  readonly title: ReactNode
  readonly subtitle?: ReactNode
  readonly badge?: ReactNode
  readonly onClose: () => void
  readonly children: ReactNode
  readonly labelId: string
  readonly size?: "wide"
}) => {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, labelId])

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className={size === "wide" ? "drawer drawer-wide" : "drawer"} role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head drawer-head-simple">
          <div className="drawer-id">
            <h2 id={labelId}>{title}</h2>
            {subtitle !== undefined && <p className="quiet small">{subtitle}</p>}
          </div>
          {badge}
          <button ref={closeRef} id={`${labelId}-close`} type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}

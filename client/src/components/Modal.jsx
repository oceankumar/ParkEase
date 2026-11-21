import { useEffect, useEffectEvent, useId, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Reusable Modal component providing an accessible dialog overlay
 * with header title, description, body content, actions footer,
 * backdrop dismissal, and keyboard escape handling.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = "",
}) {
  const generatedId = useId();
  const titleId = `modal-title-${generatedId}`;
  const descId = `modal-desc-${generatedId}`;
  const dialog = useRef(null);
  const dismiss = useEffectEvent(() => { if (closeOnEscape) onClose?.(); });

  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement;
    const siblings = [...document.body.children].filter((node) => !node.contains(dialog.current));
    const previousInert = siblings.map((node) => [node, node.inert]);
    for (const [node] of previousInert) node.inert = true;
    const focusable = () => [...dialog.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter((node) => node.getClientRects().length);
    (focusable()[0] || dialog.current).focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
      if (e.key === "Tab") {
        const list = focusable();
        const first = list[0];
        const last = list.at(-1);
        if (!first) { e.preventDefault(); dialog.current.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
          e.preventDefault(); first.focus();
        }
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      for (const [node, inert] of previousInert) node.inert = inert;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = `modal-${size}`;
  const modalContent = (
    <div
      className="modal-backdrop"
      onClick={closeOnBackdrop ? () => onClose?.() : undefined}
    >
      <div
        role="dialog"
        ref={dialog}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={`modal-container ${sizeClass} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
        aria-hidden="false"
      >
        <div className="modal-header">
          <div className="modal-title-group">
            {title && (
              <h2 id={titleId} className="modal-title">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="modal-description">
                {description}
              </p>
            )}
          </div>

          {showCloseButton && (
            <button
              type="button"
              className="modal-close-button"
              onClick={() => onClose?.()}
              aria-label="Close dialog"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="modal-body">{children}</div>

        {actions && <div className="modal-footer">{actions}</div>}
      </div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}

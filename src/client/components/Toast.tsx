import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck } from 'lucide-react';

export function Toast({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const supportsPopover = 'showPopover' in HTMLElement.prototype;
  useEffect(() => {
    const node = ref.current;
    if (!node || !supportsPopover) return;
    // Reopen to move above an already open dialog in the browser's top layer.
    if (node.matches(':popover-open')) node.hidePopover();
    if (message) node.showPopover();
  }, [message, supportsPopover]);
  return createPortal(
    <div
      ref={ref}
      popover={supportsPopover ? 'manual' : undefined}
      className="toast"
      hidden={!message}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <CheckCheck size={18} />
      {message}
    </div>,
    document.body,
  );
}

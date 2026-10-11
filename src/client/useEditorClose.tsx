import { useEffect, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { ConfirmDialog } from './dialogs/ConfirmDialog';

export function useEditorClose(value: unknown, close: () => void, busy: boolean) {
  const serialized = JSON.stringify(value);
  const initial = useRef(serialized);
  const dirty = initial.current !== serialized;
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  return {
    requestClose: () => {
      if (busy) return;
      if (dirty) setConfirming(true);
      else close();
    },
    confirmation: confirming ? (
      <ConfirmDialog
        title="放弃未保存的更改？"
        description="关闭后，本次修改将不会保存。"
        cancelLabel="继续编辑"
        confirmLabel="放弃更改"
        confirmIcon={<Undo2 size={16} />}
        close={() => setConfirming(false)}
        confirm={async () => {
          if (!busy) close();
        }}
      />
    ) : null,
  };
}

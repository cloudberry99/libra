import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Message } from '../components/ui';
import { Modal } from '../components/Modal';
import { errorMessage } from '../api';

export function ConfirmDialog({
  title,
  description,
  close,
  confirm,
  confirmLabel = '确认删除',
  confirmVariant = 'danger',
  confirmIcon = <Trash2 size={16} />,
}: {
  title: string;
  description: string;
  close: () => void;
  confirm: () => Promise<void>;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  confirmIcon?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="modal-body">
        <p className="confirm-description">{description}</p>
        {error && <Message tone="error">{error}</Message>}
      </div>
      <div className="modal-footer">
        <Button type="button" variant="secondary" onClick={close} disabled={busy}>
          取消
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm();
              close();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmIcon}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

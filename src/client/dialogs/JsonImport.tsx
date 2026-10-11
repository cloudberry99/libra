import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { ServerImportResult } from '../../shared/types';
import { MAX_SERVER_IMPORT_BYTES, validateServerImport } from '../../shared/server-import';
import { Button, Field, Message } from '../components/ui';
import { Modal } from '../components/Modal';
import { api, errorMessage } from '../api';

import { useEditorClose } from '../useEditorClose';

export function JsonImport({
  close,
  save,
  catalogRevision,
}: {
  close: () => void;
  save: (result: ServerImportResult) => void;
  catalogRevision: string;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { requestClose, confirmation } = useEditorClose(value, close, busy);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error('JSON 格式不正确，请检查括号和引号');
      }
      const configs = validateServerImport(parsed);
      const payload = { configs, catalogRevision };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_SERVER_IMPORT_BYTES)
        throw new Error('一次导入的数据不能超过 8 MiB，请减少服务器数量');
      save(await api<ServerImportResult>('/api/servers/import', 'POST', payload));
      close();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title="从 JSON 添加"
        subtitle="支持单个配置对象或订阅数组，全部校验通过后一次性导入。"
        close={requestClose}
      >
        <form onSubmit={submit}>
          <div className="modal-body">
            <Field label="服务器配置">
              <textarea
                className="code-input"
                rows={13}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError('');
                }}
                disabled={busy}
                autoFocus
                spellCheck={false}
                placeholder={
                  '[\n  {\n    "type": "emby",\n    "name": "家庭媒体库",\n    "primary": { "url": "https://media.example.com" }\n  },\n  {\n    "type": "emby",\n    "name": "另一台服务器",\n    "primary": { "url": "https://other.example.com" }\n  }\n]'
                }
                required
                maxLength={MAX_SERVER_IMPORT_BYTES}
              />
            </Field>
            {error && (
              <Message tone="error">
                <span className="json-import-error">{error}</span>
              </Message>
            )}
          </div>
          <div className="modal-footer">
            <Button variant="secondary" type="button" onClick={requestClose} disabled={busy}>
              取消
            </Button>
            <Button type="submit" busy={busy}>
              <Plus size={16} />
              校验并导入
            </Button>
          </div>
        </form>
      </Modal>
      {confirmation}
    </>
  );
}

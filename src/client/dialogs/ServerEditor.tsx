import { useState, type FormEvent } from 'react';
import { Check, Plus, Server, Trash2, Waypoints } from 'lucide-react';
import type { Endpoint, ServerRecord } from '../../shared/types';
import { validateConfig } from '../../shared/validation';
import { Button, IconButton, Field, PasswordInput, Message, Switch } from '../components/ui';
import { Modal } from '../components/Modal';
import { api, errorMessage } from '../api';

import { useEditorClose } from '../useEditorClose';

export function ServerEditor({
  server,
  close,
  save,
}: {
  server?: ServerRecord;
  close: () => void;
  save: (record: ServerRecord) => void;
}) {
  const original = server?.config;
  const [name, setName] = useState(original?.name ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [logo, setLogo] = useState(original?.logo ?? '');
  const [username, setUsername] = useState(original?.credentials?.username ?? '');
  const [password, setPassword] = useState(original?.credentials?.password ?? '');
  const [includePassword, setIncludePassword] = useState(
    !server || original?.credentials?.password !== undefined,
  );
  const [primary, setPrimary] = useState<Endpoint>(original?.primary ?? { url: '', name: '' });
  const [alternates, setAlternates] = useState<Endpoint[]>(
    original?.alternates?.map((line) => ({ ...line })) ?? [],
  );
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestClose = useEditorClose(
    { name, note, logo, username, password, includePassword, primary, alternates, enabled },
    close,
    busy,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const config = validateConfig({
        type: 'emby',
        name,
        note,
        logo,
        credentials: { username, ...(includePassword ? { password } : {}) },
        primary,
        alternates,
      });
      const record = await api<ServerRecord>(
        `/api/servers${server ? `/${server.id}` : ''}`,
        server ? 'PUT' : 'POST',
        { config, enabled, version: server?.version },
      );
      save(record);
      close();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={server ? '编辑服务器' : '添加服务器'}
      subtitle="保存连接信息，随时导入你喜欢的播放器。"
      close={requestClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-section-heading">
            <Server size={17} />
            <h3>基本信息</h3>
            <span>EMBY</span>
          </div>
          <div className="form-grid">
            <Field label="服务器名称" optional>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：家庭媒体库"
                maxLength={100}
                autoFocus
              />
            </Field>
            <Field label="备注" optional>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="一句话介绍这份媒体收藏"
                maxLength={500}
              />
            </Field>
          </div>
          <Field label="Logo 地址" optional hint="仅支持 HTTPS；图片站点会收到你的浏览器请求。">
            <input
              value={logo}
              onChange={(event) => setLogo(event.target.value)}
              type="url"
              placeholder="https://example.com/logo.png"
              maxLength={2048}
            />
          </Field>
          <div className="form-grid">
            <Field label="用户名" optional>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                placeholder="Emby 账号"
                maxLength={200}
              />
            </Field>
            <Field label="密码" optional>
              <PasswordInput value={password} onChange={setPassword} placeholder="服务器登录密码" />
            </Field>
          </div>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={includePassword}
              onChange={(event) => setIncludePassword(event.target.checked)}
            />
            在配置中提供密码<span>留空表示空密码；取消勾选则省略此字段</span>
          </label>
          <div className="section-divider" />
          <div className="form-section-heading">
            <Waypoints size={17} />
            <h3>连接线路</h3>
          </div>
          <div className="line-editor primary-line">
            <div className="line-label">
              <span className="route-dot" />
              主线路
            </div>
            <div className="route-fields">
              <Field label="线路地址">
                <input
                  type="url"
                  value={primary.url}
                  onChange={(event) => setPrimary({ ...primary, url: event.target.value })}
                  placeholder="https://media.example.com:8920/emby"
                  required
                  maxLength={2048}
                />
              </Field>
              <Field label="线路名称" optional>
                <input
                  value={primary.name ?? ''}
                  onChange={(event) => setPrimary({ ...primary, name: event.target.value })}
                  placeholder="主线路"
                  maxLength={100}
                />
              </Field>
            </div>
          </div>
          {alternates.map((line, index) => (
            <div className="line-editor" key={index}>
              <div className="line-label">
                <span className="route-dot muted" />
                备用线路 {index + 1}
                <IconButton
                  label={`删除备用线路 ${index + 1}`}
                  onClick={() => setAlternates(alternates.filter((_, i) => i !== index))}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
              <div className="route-fields">
                <Field label="线路地址">
                  <input
                    type="url"
                    value={line.url}
                    onChange={(event) =>
                      setAlternates(
                        alternates.map((item, i) =>
                          i === index ? { ...item, url: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="http://192.168.1.10:8096"
                    required
                    maxLength={2048}
                  />
                </Field>
                <Field label="线路名称" optional>
                  <input
                    value={line.name ?? ''}
                    onChange={(event) =>
                      setAlternates(
                        alternates.map((item, i) =>
                          i === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="例如：家中直连"
                    maxLength={100}
                  />
                </Field>
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            type="button"
            className="dashed full"
            disabled={alternates.length >= 32}
            onClick={() => setAlternates([...alternates, { url: '', name: '' }])}
          >
            <Plus size={16} />
            添加备用线路 <span className="muted-text">{alternates.length} / 32</span>
          </Button>
          <p className="field-note">支持局域网、IPv6 和反向代理路径。备用线路应指向同一台可信服务器。</p>
          <div className="setting-row">
            <div>
              <strong>包含在订阅中</strong>
              <p>启用后，这台服务器可通过订阅链接获取。</p>
            </div>
            <Switch checked={enabled} onChange={() => setEnabled(!enabled)} label="包含在订阅中" />
          </div>
          {error && <Message tone="error">{error}</Message>}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" type="button" onClick={requestClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" busy={busy}>
            <Check size={16} />
            {server ? '保存更改' : '添加服务器'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

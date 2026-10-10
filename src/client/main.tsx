import React, { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  Grid2X2,
  KeyRound,
  Layers3,
  Link2,
  List,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Waypoints,
  X,
} from 'lucide-react';
import type {
  DashboardData,
  Endpoint,
  PlayerId,
  ServerConfig,
  ServerRecord,
  Subscription,
} from '../shared/types';
import { PLAYERS, playerLink } from '../shared/players';
import { validateConfig, validatePassword, validateSlug } from '../shared/validation';
import './style.css';

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(method !== 'GET'
      ? {
          headers: { 'Content-Type': 'application/json', 'X-Libra-Request': '1' },
          body: JSON.stringify(body ?? {}),
        }
      : {}),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/'))
      window.dispatchEvent(new Event('libra:expired'));
    throw new Error(typeof data.error === 'string' ? data.error : '请求失败，请稍后重试');
  }
  return data as T;
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '操作未完成，请重试');
const titleOf = (server: ServerRecord) => server.config.name || new URL(server.config.primary.url).hostname;
const makeSlug = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
const feedURL = (slug: string) => `${window.location.origin}/${slug}`;
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-mark">
        <span />
      </span>
      <div>
        Libra<small>你的媒体连接中心</small>
      </div>
    </div>
  );
}
function Spinner() {
  return <LoaderCircle className="spin" size={18} aria-label="加载中" />;
}
function Button({
  children,
  variant = 'primary',
  busy = false,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`button ${variant} ${className}`}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}
function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...props} type="button" className="icon-button" aria-label={label} title={label}>
      {children}
    </button>
  );
}
function Field({
  label,
  hint,
  children,
  optional = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {optional && <em>选填</em>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'new-password',
  placeholder = '输入密码',
  required = false,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        maxLength={1024}
      />
      <button
        type="button"
        aria-label={visible ? '隐藏密码' : '显示密码'}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
function Message({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' }) {
  return (
    <div className={`message ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {tone === 'error' ? (
        <CircleHelp size={17} />
      ) : tone === 'success' ? (
        <CheckCheck size={17} />
      ) : (
        <ShieldCheck size={17} />
      )}
      <span>{children}</span>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && event.clientX !== 0) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton label="关闭" onClick={close}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function Strength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Za-z]/.test(password),
    /[0-9]/.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ];
  return (
    <div className="strength">
      <div className="strength-bars">
        {checks.map((valid, index) => (
          <i key={index} className={valid ? 'valid' : ''} />
        ))}
      </div>
      <p>
        {['至少 8 位', '字母', '数字', '符号'].map((label, index) => (
          <span key={label} className={checks[index] ? 'valid' : ''}>
            {checks[index] && <Check size={11} />}
            {label}
          </span>
        ))}
      </p>
    </div>
  );
}
function Login({
  initialized,
  configured,
  onLogin,
}: {
  initialized: boolean;
  configured: boolean;
  onLogin: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!initialized) {
        validatePassword(password);
        if (password !== confirm) throw new Error('两次输入的密码不一致');
      }
      await api(`/api/auth/${initialized ? 'login' : 'setup'}`, 'POST', {
        password,
        ...(!initialized ? { setupKey } : {}),
      });
      setPassword('');
      setConfirm('');
      setSetupKey('');
      onLogin();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow">
            <i /> ONE HOME FOR YOUR MEDIA
          </span>
          <h1>
            所有热爱，
            <br />
            从这里连接。
          </h1>
          <p>
            把分散的媒体服务器整理在一起。
            <br />
            一次维护，随心打开你喜欢的播放器。
          </p>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-center">
              <span className="brand-mark large">
                <span />
              </span>
            </div>
            <div className="orbit-node node-one">
              <Server size={24} />
            </div>
            <div className="orbit-node node-two">
              <Radio size={25} />
            </div>
            <div className="orbit-node node-three">
              <Link2 size={24} />
            </div>
            <span className="orbit-dot dot-one" />
            <span className="orbit-dot dot-two" />
          </div>
          <div className="auth-players">
            {PLAYERS.map((player) => (
              <span key={player.id}>{player.name}</span>
            ))}
          </div>
        </div>
        <span className="auth-footnote">少一点重复配置，多一点观影时光。</span>
      </div>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form">
          <span className="auth-lock">
            <LockKeyhole size={24} />
          </span>
          <span className="eyebrow neutral">LIBRA WORKSPACE</span>
          <h2>{initialized ? '欢迎回来' : '创建你的连接空间'}</h2>
          <p>
            {initialized
              ? '输入管理密码，回到你的媒体工作台。'
              : '先设置管理密码，让每一份配置都有安全的归处。'}
          </p>
          {!configured ? (
            <Message tone="error">
              部署还差一步：在 Cloudflare 的 Worker 设置中添加至少 32 位的 APP_SECRET
              密钥，然后刷新页面。建议使用随机生成的 64 位十六进制字符串。
            </Message>
          ) : (
            <form onSubmit={submit}>
              {!initialized && (
                <Field label="部署密钥" hint="填写部署时设置的 APP_SECRET，仅用于首次初始化。">
                  <PasswordInput
                    value={setupKey}
                    onChange={setSetupKey}
                    placeholder="验证这个空间属于你"
                    required
                  />
                </Field>
              )}
              <Field label={initialized ? '管理密码' : '设置管理密码'}>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={initialized ? 'current-password' : 'new-password'}
                  placeholder={initialized ? '输入你的管理密码' : '至少 8 位，包含字母、数字和符号'}
                  required
                />
              </Field>
              {!initialized && (
                <>
                  <Strength password={password} />
                  <Field label="确认管理密码">
                    <PasswordInput
                      value={confirm}
                      onChange={setConfirm}
                      placeholder="再次输入管理密码"
                      required
                    />
                  </Field>
                </>
              )}
              {error && <Message tone="error">{error}</Message>}
              <Button type="submit" busy={busy} className="full">
                {initialized ? '进入工作台' : '创建并进入工作台'}
                <ArrowRight size={17} />
              </Button>
            </form>
          )}
          <div className="auth-assurance">
            <ShieldCheck size={15} />
            私有管理 · 加密存储 · 自由连接
          </div>
        </div>
        <div className="auth-copyright">
          LIBRA <span>为你的媒体生活，留一份秩序。</span>
        </div>
      </main>
    </div>
  );
}

function ServerEditor({
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
      close={close}
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
          <Field label="Logo 地址" optional>
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
          <Button variant="secondary" type="button" onClick={close}>
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
function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
    >
      <span />
    </button>
  );
}
function SubscriptionEditor({
  subscription,
  servers,
  close,
  save,
}: {
  subscription?: Subscription;
  servers: ServerRecord[];
  close: () => void;
  save: (value: Subscription) => void;
}) {
  const [name, setName] = useState(subscription?.name ?? '我的媒体订阅');
  const [slug, setSlug] = useState(subscription?.slug ?? makeSlug());
  const [allServers, setAllServers] = useState(subscription?.allServers ?? true);
  const [serverIds, setServerIds] = useState<string[]>(
    subscription?.serverIds.filter((id) => servers.some((server) => server.id === id)) ?? [],
  );
  const [enabled, setEnabled] = useState(subscription?.enabled ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      validateSlug(slug);
      const record = await api<Subscription>(
        `/api/subscriptions${subscription ? `/${subscription.id}` : ''}`,
        subscription ? 'PUT' : 'POST',
        { name, slug, allServers, serverIds, enabled, version: subscription?.version },
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
      title={subscription ? '编辑订阅链接' : '创建订阅链接'}
      subtitle="给客户端一个地址，让服务器配置保持同步。"
      close={close}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <Field label="订阅名称">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              placeholder="例如：我的 iPhone"
              autoFocus
              required
            />
          </Field>
          <Field label="链接后缀" hint="8–64 位字母或数字。随机后缀更难猜测。">
            <div className="input-with-action">
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                minLength={8}
                maxLength={64}
                pattern="[A-Za-z0-9]{8,64}"
                required
                spellCheck={false}
              />
              <IconButton label="随机生成后缀" onClick={() => setSlug(makeSlug())}>
                <RefreshCw size={17} />
              </IconButton>
            </div>
          </Field>
          <div className="url-preview">
            <Link2 size={15} />
            <span>{feedURL(slug || '…')}</span>
          </div>
          {subscription && slug !== subscription.slug && (
            <Message>保存后旧链接将失效。请在客户端更新订阅地址，传播可能需要一分钟或更久。</Message>
          )}
          <div className="section-divider" />
          <span className="field-label">包含哪些服务器</span>
          <div className="segmented">
            <button type="button" className={allServers ? 'active' : ''} onClick={() => setAllServers(true)}>
              全部服务器
            </button>
            <button
              type="button"
              className={!allServers ? 'active' : ''}
              onClick={() => setAllServers(false)}
            >
              指定服务器
            </button>
          </div>
          {allServers ? (
            <p className="field-note">自动包含当前及以后添加的已启用服务器。</p>
          ) : (
            <div className="server-picker">
              {servers.length ? (
                servers.map((server) => (
                  <label key={server.id}>
                    <input
                      type="checkbox"
                      checked={serverIds.includes(server.id)}
                      onChange={(event) =>
                        setServerIds(
                          event.target.checked
                            ? [...serverIds, server.id]
                            : serverIds.filter((id) => id !== server.id),
                        )
                      }
                    />
                    <span className="mini-server">
                      <Server size={16} />
                    </span>
                    <span>
                      {titleOf(server)}
                      <small>{new URL(server.config.primary.url).host}</small>
                    </span>
                    {!server.enabled && <em>已停用</em>}
                  </label>
                ))
              ) : (
                <p className="field-note">先添加一台服务器，再为它创建专属订阅。</p>
              )}
            </div>
          )}
          <div className="setting-row">
            <div>
              <strong>启用订阅</strong>
              <p>停用后，客户端将无法获取配置。</p>
            </div>
            <Switch checked={enabled} onChange={() => setEnabled(!enabled)} label="启用订阅" />
          </div>
          <Message>链接中包含服务器账号与密码。请只分享给可信的人，不要发布到公开页面。</Message>
          {error && <Message tone="error">{error}</Message>}
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={close}>
            取消
          </Button>
          <Button type="submit" busy={busy}>
            <Link2 size={16} />
            {subscription ? '保存链接' : '创建链接'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ImportDialog({
  server,
  close,
  copy,
}: {
  server: ServerRecord;
  close: () => void;
  copy: (value: string) => void;
}) {
  const [player, setPlayer] = useState<PlayerId>('libra');
  const selected = PLAYERS.find((item) => item.id === player)!;
  const link = playerLink(player, server.config);
  return (
    <Modal title="打开喜欢的播放器" subtitle="选择应用，将这份连接配置带过去。" close={close}>
      <div className="modal-body">
        <div className="import-server">
          <span className="server-art">
            <Server size={25} />
          </span>
          <div>
            <strong>{titleOf(server)}</strong>
            <p>{server.config.primary.url}</p>
          </div>
          <span className="pill">Emby</span>
        </div>
        <div className="player-grid">
          {PLAYERS.map((item) => (
            <button
              key={item.id}
              className={`player-option ${player === item.id ? 'selected' : ''}`}
              onClick={() => setPlayer(item.id)}
              aria-pressed={player === item.id}
            >
              <span className={`player-icon ${item.id}`}>{item.initial}</span>
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
              {player === item.id && <Check size={15} className="player-check" />}
            </button>
          ))}
        </div>
        {link.warning && <Message tone="error">{link.warning}</Message>}
        <div className="import-note">
          <ShieldCheck size={18} />
          <p>导入链接包含账号信息，请妥善保管。需在当前设备安装对应播放器；各播放器支持的字段可能不同。</p>
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="secondary" type="button" disabled={!link.url} onClick={() => copy(link.url)}>
          <Copy size={16} />
          复制导入链接
        </Button>
        {link.url ? (
          <a className="button primary" href={link.url} rel="noreferrer">
            打开 {selected.name}
            <ArrowUpRight size={17} />
          </a>
        ) : (
          <Button disabled>暂不支持此地址</Button>
        )}
      </div>
    </Modal>
  );
}
function JsonImport({ close, save }: { close: () => void; save: (row: ServerRecord) => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error('JSON 格式不正确，请检查括号和引号');
      }
      if (Array.isArray(parsed)) throw new Error('请粘贴单台服务器的配置对象，不需要外层数组');
      const config = validateConfig(parsed);
      save(await api<ServerRecord>('/api/servers', 'POST', { config }));
      close();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="从 JSON 添加" subtitle="粘贴与订阅接口相同格式的单台服务器配置。" close={close}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <Field label="服务器配置">
            <textarea
              className="code-input"
              rows={13}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
              spellCheck={false}
              placeholder={
                '{\n  "type": "emby",\n  "name": "家庭媒体库",\n  "primary": {\n    "url": "https://media.example.com"\n  }\n}'
              }
              required
              maxLength={100000}
            />
          </Field>
          {error && <Message tone="error">{error}</Message>}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" type="button" onClick={close}>
            取消
          </Button>
          <Button type="submit" busy={busy}>
            <Plus size={16} />
            添加服务器
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function SubscriptionQR({
  subscription,
  close,
  copy,
}: {
  subscription: Subscription;
  close: () => void;
  copy: (value: string) => void;
}) {
  const url = feedURL(subscription.slug);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      width: 600,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#252b43', light: '#ffffff' },
    })
      .then((value) => {
        if (active) setImage(value);
      })
      .catch(() => {
        if (active) setError('二维码生成失败，请关闭后重试');
      });
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <Modal title="扫描，带走这份连接" subtitle={subscription.name} close={close}>
      <div className="modal-body qr-body">
        <div className="qr-frame">
          {image ? (
            <img src={image} width={260} height={260} alt={`${subscription.name} 的订阅链接二维码`} />
          ) : error ? (
            <Message tone="error">{error}</Message>
          ) : (
            <Spinner />
          )}
        </div>
        <p className="qr-caption">在客户端扫描二维码，获取订阅链接</p>
        <div className="url-preview">
          <Link2 size={15} />
          <span>{url}</span>
        </div>
        {!subscription.enabled && <Message tone="error">这条订阅已停用，请启用后再扫描获取配置。</Message>}
        <p className="field-note">二维码与订阅链接拥有相同访问权限，请只向可信的人展示。</p>
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={() => copy(url)}>
          <Copy size={16} />
          复制链接
        </Button>
        {image && (
          <a className="button primary" href={image} download={`libra-subscription-${subscription.slug}.png`}>
            <ArrowDownToLine size={16} />
            下载二维码
          </a>
        )}
      </div>
    </Modal>
  );
}
function ConfirmDialog({
  title,
  description,
  close,
  confirm,
}: {
  title: string;
  description: string;
  close: () => void;
  confirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={title} close={close}>
      <div className="modal-body">
        <p className="confirm-description">{description}</p>
        {error && <Message tone="error">{error}</Message>}
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={close} disabled={busy}>
          取消
        </Button>
        <Button
          variant="danger"
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
          <Trash2 size={16} />
          确认删除
        </Button>
      </div>
    </Modal>
  );
}
function Help({ close }: { close: () => void }) {
  return (
    <Modal title="连接，其实很简单" subtitle="从服务器到播放器，三步就好。" close={close}>
      <div className="modal-body">
        <div className="help-step">
          <span>01</span>
          <div>
            <h3>整理你的服务器</h3>
            <p>添加 Emby 地址、账号和备用线路。密码会原样保留，重复的线路会自动合并。</p>
          </div>
        </div>
        <div className="help-step">
          <span>02</span>
          <div>
            <h3>打开喜欢的播放器</h3>
            <p>
              在服务器卡片点击「导入播放器」，选择已安装的应用。Libra 支持完整 v1
              配置，其余应用按各自的协议生成链接。
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>03</span>
          <div>
            <h3>让配置跟随你</h3>
            <p>创建订阅链接，交给支持此 JSON 接口的客户端。以后修改服务器，客户端再次拉取即可获得更新。</p>
          </div>
        </div>
        <Message>
          公开订阅地址是一把读取配置的钥匙。请妥善保管；停用、删除或更换后缀后，边缘节点同步可能需要一分钟或更久，客户端已保存的数据不会被远程删除。
        </Message>
        <p className="field-note">
          本工具与同名 Libra 播放器是独立项目。导入仅生成配置链接，不检测服务器连通性。
        </p>
      </div>
      <div className="modal-footer">
        <Button onClick={close}>
          明白了
          <Check size={16} />
        </Button>
      </div>
    </Modal>
  );
}
function Security() {
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess(false);
    try {
      validatePassword(password);
      if (password !== confirmation) throw new Error('两次输入的新密码不一致');
      await api('/api/auth/password', 'POST', { currentPassword, password });
      setCurrent('');
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="security-layout">
      <section className="panel security-panel">
        <div className="panel-heading">
          <span className="feature-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2>管理密码</h2>
            <p>为你的媒体空间换一把新钥匙。</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <Field label="当前密码">
            <PasswordInput
              value={currentPassword}
              onChange={setCurrent}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="新密码">
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="至少 8 位，包含字母、数字和符号"
              required
            />
          </Field>
          <Strength password={password} />
          <Field label="确认新密码">
            <PasswordInput
              value={confirmation}
              onChange={setConfirmation}
              placeholder="再次输入新密码"
              required
            />
          </Field>
          {error && <Message tone="error">{error}</Message>}
          {success && <Message tone="success">密码已更新。其他会话将在配置传播后失效。</Message>}
          <Button type="submit" busy={busy}>
            <ShieldCheck size={17} />
            更新管理密码
          </Button>
        </form>
      </section>
      <aside className="security-aside">
        <ShieldCheck size={28} />
        <h3>安全感，来自细节。</h3>
        <p>管理密码保存为加盐校验哈希；服务器配置加密存储。每一次登录都有独立的会话，有效期为 12 小时。</p>
        <div className="section-divider" />
        <strong>请保管好订阅链接</strong>
        <p>持有链接的人可以读取其中的账号密码。使用随机后缀，并在不再需要时停用链接。</p>
        <strong>保留部署密钥的备份</strong>
        <p>APP_SECRET 用于解密已有数据，重新部署时请保持不变。</p>
      </aside>
    </div>
  );
}
type Page = 'servers' | 'subscriptions' | 'security';
type DialogState =
  | { kind: 'server'; server?: ServerRecord }
  | { kind: 'subscription'; subscription?: Subscription }
  | { kind: 'import'; server: ServerRecord }
  | { kind: 'json' }
  | { kind: 'qr'; subscription: Subscription }
  | { kind: 'help' }
  | { kind: 'deleteServer'; server: ServerRecord }
  | { kind: 'deleteSubscription'; subscription: Subscription }
  | null;
function Workspace({ logout }: { logout: () => void }) {
  const [data, setData] = useState<DashboardData>({ servers: [], subscriptions: [] });
  const [page, setPage] = useState<Page>('servers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState('grid');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify('已复制到剪贴板');
    } catch {
      notify('复制失败，请检查浏览器剪贴板权限');
    }
  }
  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api<DashboardData>('/api/dashboard'));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  function saveServer(record: ServerRecord) {
    setData((previous) => ({
      ...previous,
      servers: previous.servers.some((item) => item.id === record.id)
        ? previous.servers.map((item) => (item.id === record.id ? record : item))
        : [...previous.servers, record],
    }));
    notify('服务器已保存');
  }
  function saveSubscription(record: Subscription) {
    setData((previous) => ({
      ...previous,
      subscriptions: previous.subscriptions.some((item) => item.id === record.id)
        ? previous.subscriptions.map((item) => (item.id === record.id ? record : item))
        : [record, ...previous.subscriptions],
    }));
    notify('订阅链接已保存');
  }
  async function toggleServer(server: ServerRecord) {
    setBusyId(server.id);
    try {
      saveServer(
        await api<ServerRecord>(`/api/servers/${server.id}`, 'PUT', {
          version: server.version,
          enabled: !server.enabled,
        }),
      );
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusyId('');
    }
  }
  async function toggleSubscription(subscription: Subscription) {
    setBusyId(subscription.id);
    try {
      saveSubscription(
        await api<Subscription>(`/api/subscriptions/${subscription.id}`, 'PUT', {
          ...subscription,
          enabled: !subscription.enabled,
        }),
      );
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusyId('');
    }
  }
  const shown = data.servers.filter(
    (server) =>
      (filter === 'all' || server.enabled === (filter === 'enabled')) &&
      `${titleOf(server)} ${server.config.note ?? ''} ${server.config.primary.url} ${server.config.credentials?.username ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const titles = {
    servers: ['服务器', '所有连接，井井有条。'],
    subscriptions: ['订阅链接', '一次更新，让配置跟随每一台设备。'],
    security: ['安全设置', '守护你的账号与连接信息。'],
  };
  const activeSubs = data.subscriptions.filter((item) => item.enabled).length;
  return (
    <div className="app-shell">
      {mobileNav && (
        <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <Brand />
        <div className="nav-label">我的工作台</div>
        <nav>
          {(
            [
              { id: 'servers', title: '服务器', icon: <Server size={19} />, count: data.servers.length },
              {
                id: 'subscriptions',
                title: '订阅链接',
                icon: <Link2 size={19} />,
                count: data.subscriptions.length,
              },
              { id: 'security', title: '安全设置', icon: <ShieldCheck size={19} /> },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => {
                setPage(item.id);
                setMobileNav(false);
              }}
            >
              {item.icon}
              <span>{item.title}</span>
              {'count' in item && <em>{item.count}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <h3>连接到更多可能</h3>
            <p>
              五款播放器，一份配置。
              <br />
              让每次开始都简单一点。
            </p>
            <button onClick={() => setDialog({ kind: 'help' })}>
              使用指南
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-user">
            <span className="avatar">
              <UserRound size={20} />
            </span>
            <div>
              <strong>管理员</strong>
              <small>私人媒体空间</small>
            </div>
            <IconButton
              label="退出登录"
              onClick={async () => {
                try {
                  await api('/api/auth/logout', 'POST');
                  logout();
                } catch (error) {
                  notify(errorMessage(error));
                }
              }}
            >
              <LogOut size={17} />
            </IconButton>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="打开导航"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>工作台</span>
            <ChevronDown size={12} className="breadcrumb-arrow" />
            <strong>{titles[page][0]}</strong>
          </div>
          <div className="topbar-right">
            <span className="private-badge">
              <LockKeyhole size={13} />
              私人空间
            </span>
            <IconButton label="使用指南" onClick={() => setDialog({ kind: 'help' })}>
              <CircleHelp size={19} />
            </IconButton>
            <span className="topbar-avatar">L</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">YOUR MEDIA, CONNECTED</div>
              <h1>
                {titles[page][0]}
                <span className="heading-dot">.</span>
              </h1>
              <p>{titles[page][1]}</p>
            </div>
            {page !== 'security' && (
              <Button
                onClick={() => setDialog(page === 'servers' ? { kind: 'server' } : { kind: 'subscription' })}
              >
                <Plus size={18} />
                {page === 'servers' ? '添加服务器' : '创建订阅'}
              </Button>
            )}
          </div>
          {error && (
            <Message tone="error">
              {error}{' '}
              <button className="text-button" onClick={() => void load()}>
                重新加载
              </button>
            </Message>
          )}
          {page === 'servers' && (
            <>
              <section className="welcome-banner">
                <div>
                  <span className="banner-label">
                    <span />
                    EVERYTHING IN ONE PLACE
                  </span>
                  <h2>好内容，值得一个好入口。</h2>
                  <p>管理你的 Emby 服务器，一键连接到喜欢的播放器。</p>
                  <div className="banner-players">
                    {PLAYERS.slice(0, 4).map((player) => (
                      <span key={player.id}>{player.name}</span>
                    ))}
                    <span>+1</span>
                  </div>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="banner-orbit" />
                  <div className="banner-connection connection-one" />
                  <div className="banner-connection connection-two" />
                  <div className="floating-tile tile-left">
                    <Server size={26} />
                  </div>
                  <div className="floating-tile tile-center">
                    <Layers3 size={36} />
                  </div>
                  <div className="floating-tile tile-right">
                    <Radio size={27} />
                  </div>
                  <i className="art-spark spark-one" />
                  <i className="art-spark spark-two" />
                </div>
              </section>
              <div className="stats-grid">
                <div className="stat">
                  <span className="stat-icon purple">
                    <Server size={21} />
                  </span>
                  <div>
                    <span>服务器总数</span>
                    <strong>
                      {loading ? '—' : data.servers.length}
                      <small>个连接，随时出发</small>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon green">
                    <Waypoints size={22} />
                  </span>
                  <div>
                    <span>已启用线路</span>
                    <strong>
                      {loading
                        ? '—'
                        : data.servers
                            .filter((item) => item.enabled)
                            .reduce((n, item) => n + 1 + (item.config.alternates?.length ?? 0), 0)}
                      <small>主线路与备用线路</small>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon orange">
                    <Link2 size={21} />
                  </span>
                  <div>
                    <span>已启用订阅</span>
                    <strong>
                      {loading ? '—' : activeSubs}
                      <small>配置跟随你的设备</small>
                    </strong>
                  </div>
                </div>
              </div>
              <div className="collection-heading">
                <h2>
                  我的服务器 <span>{data.servers.length}</span>
                </h2>
                <button className="text-button muted-text" onClick={() => setDialog({ kind: 'json' })}>
                  <ArrowDownToLine size={15} />从 JSON 添加
                </button>
              </div>
              <div className="toolbar">
                <div className="filter-tabs">
                  {[
                    ['all', '全部'],
                    ['enabled', '已启用'],
                    ['disabled', '已停用'],
                  ].map(([id, title]) => (
                    <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
                      {title}
                    </button>
                  ))}
                </div>
                <div className="toolbar-tools">
                  <label className="search">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索名称、地址或账号"
                      aria-label="搜索服务器"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} aria-label="清除搜索">
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="view-switch">
                    <IconButton
                      label="卡片视图"
                      aria-pressed={layout === 'grid'}
                      onClick={() => setLayout('grid')}
                    >
                      <Grid2X2 size={17} />
                    </IconButton>
                    <IconButton
                      label="列表视图"
                      aria-pressed={layout === 'list'}
                      onClick={() => setLayout('list')}
                    >
                      <List size={18} />
                    </IconButton>
                  </div>
                  <IconButton label="刷新服务器" disabled={loading} onClick={() => void load()}>
                    <RefreshCw size={17} className={loading ? 'spin' : ''} />
                  </IconButton>
                </div>
              </div>
              {loading ? (
                <div className="loading-state">
                  <Spinner />
                  正在整理你的连接…
                </div>
              ) : shown.length ? (
                <div className={`server-grid ${layout === 'list' ? 'list-layout' : ''}`}>
                  {shown.map((server, index) => (
                    <article
                      className={`server-card ${!server.enabled ? 'disabled-card' : ''}`}
                      key={server.id}
                    >
                      <div className="server-card-top">
                        <ServerArt server={server} index={index} />
                        <div className="server-title">
                          <h3 title={titleOf(server)}>{titleOf(server)}</h3>
                          <span>{server.config.note || '属于你的媒体收藏'}</span>
                        </div>
                        <IconButton
                          label={`编辑 ${titleOf(server)}`}
                          onClick={() => setDialog({ kind: 'server', server })}
                        >
                          <Pencil size={16} />
                        </IconButton>
                      </div>
                      <div className="server-details">
                        <div>
                          <Globe2 size={15} />
                          <span title={server.config.primary.url}>
                            {server.config.primary.url.replace(/^https?:\/\//, '')}
                          </span>
                        </div>
                        <div>
                          <UserRound size={15} />
                          <span>{server.config.credentials?.username || '未填写账号'}</span>
                          <span className="route-count">
                            <Network size={13} />
                            {1 + (server.config.alternates?.length ?? 0)} 条线路
                          </span>
                        </div>
                      </div>
                      <div className="server-card-footer">
                        <button
                          className={`status-button ${server.enabled ? 'enabled' : ''}`}
                          disabled={busyId === server.id}
                          onClick={() => void toggleServer(server)}
                          title={server.enabled ? '点击停用订阅中的配置' : '点击启用配置'}
                        >
                          <span />
                          {busyId === server.id ? '保存中' : server.enabled ? '已启用' : '已停用'}
                        </button>
                        <div>
                          <IconButton
                            label={`删除 ${titleOf(server)}`}
                            onClick={() => setDialog({ kind: 'deleteServer', server })}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                          <button
                            className="import-button"
                            onClick={() => setDialog({ kind: 'import', server })}
                          >
                            导入播放器
                            <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Server size={30} />}
                  title={search || filter !== 'all' ? '没有找到匹配的服务器' : '第一份连接，从这里开始'}
                  description={
                    search || filter !== 'all'
                      ? '试试其他关键词，或切换筛选条件。'
                      : '添加 Emby 服务器，把地址、账号和备用线路整理在一起。'
                  }
                >
                  {!search && filter === 'all' && (
                    <Button onClick={() => setDialog({ kind: 'server' })}>
                      <Plus size={17} />
                      添加第一台服务器
                    </Button>
                  )}
                </Empty>
              )}
              <div className="collection-footnote">
                <ShieldCheck size={14} />
                <span>连接信息加密保存。启用状态表示纳入订阅，不代表服务器连通性。</span>
              </div>
            </>
          )}
          {page === 'subscriptions' && (
            <>
              <section className="subscription-banner">
                <span className="feature-icon">
                  <Link2 size={25} />
                </span>
                <div>
                  <h2>一个链接，让连接保持同步。</h2>
                  <p>在支持此接口的客户端填写订阅地址，即可获取最新服务器配置。</p>
                </div>
                <span className="code-badge">JSON API</span>
              </section>
              <div className="collection-heading">
                <h2>
                  我的订阅 <span>{data.subscriptions.length}</span>
                </h2>
                <IconButton label="刷新订阅" disabled={loading} onClick={() => void load()}>
                  <RefreshCw size={17} className={loading ? 'spin' : ''} />
                </IconButton>
              </div>
              {loading ? (
                <div className="loading-state">
                  <Spinner />
                  正在加载订阅…
                </div>
              ) : data.subscriptions.length ? (
                <div className="subscriptions-list">
                  {data.subscriptions.map((subscription) => (
                    <article
                      className={`subscription-card ${!subscription.enabled ? 'disabled-card' : ''}`}
                      key={subscription.id}
                    >
                      <div className="subscription-top">
                        <span className="subscription-icon">
                          <Link2 size={22} />
                        </span>
                        <div>
                          <h3>{subscription.name}</h3>
                          <p>
                            {subscription.allServers
                              ? '全部已启用服务器 · 自动包含新增'
                              : `${subscription.serverIds.filter((id) => data.servers.some((server) => server.id === id)).length} 台指定服务器`}
                          </p>
                        </div>
                        <span className={`status-label ${subscription.enabled ? 'enabled' : ''}`}>
                          <i />
                          {subscription.enabled ? '已启用' : '已停用'}
                        </span>
                        <Switch
                          checked={subscription.enabled}
                          label={`启用 ${subscription.name}`}
                          disabled={busyId === subscription.id}
                          onChange={() => void toggleSubscription(subscription)}
                        />
                      </div>
                      <div className="subscription-url">
                        <Globe2 size={16} />
                        <code>{feedURL(subscription.slug)}</code>
                        <IconButton
                          label={`复制 ${subscription.name} 链接`}
                          onClick={() => void copy(feedURL(subscription.slug))}
                        >
                          <Copy size={17} />
                        </IconButton>
                      </div>
                      <div className="subscription-bottom">
                        <span>创建于 {new Date(subscription.createdAt).toLocaleDateString('zh-CN')}</span>
                        <div>
                          <button
                            className="text-button"
                            onClick={() => setDialog({ kind: 'qr', subscription })}
                          >
                            <QrCode size={15} />
                            二维码
                          </button>
                          <a
                            href={feedURL(subscription.slug)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-button"
                          >
                            <ExternalLink size={14} />
                            查看 JSON
                          </a>
                          <button
                            className="text-button"
                            onClick={() => setDialog({ kind: 'subscription', subscription })}
                          >
                            <Settings2 size={15} />
                            管理链接
                          </button>
                          <IconButton
                            label={`删除 ${subscription.name}`}
                            onClick={() => setDialog({ kind: 'deleteSubscription', subscription })}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Link2 size={30} />}
                  title="让配置，多走一步"
                  description="创建一个专属订阅地址，供客户端自动拉取服务器配置。"
                >
                  <Button onClick={() => setDialog({ kind: 'subscription' })}>
                    <Plus size={17} />
                    创建第一条订阅
                  </Button>
                </Empty>
              )}
              <div className="subscription-notice">
                <ShieldCheck size={21} />
                <div>
                  <strong>链接即访问权限，请谨慎分享</strong>
                  <p>
                    订阅会返回账号密码。停用、更换后缀或删除后的传播可能需要一分钟或更久；客户端已保存的数据不会被远程删除。
                  </p>
                </div>
              </div>
            </>
          )}
          {page === 'security' && <Security />}
          <footer className="workspace-footer">
            <span>
              Libra <i />
              你的媒体，自由连接。
            </span>
            <button onClick={() => setDialog({ kind: 'help' })}>
              使用指南
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </div>
      </main>
      {toast &&
        createPortal(
          <div className="toast" role="status">
            <CheckCheck size={18} />
            {toast}
          </div>,
          document.querySelector('dialog[open]') ?? document.body,
        )}
      {dialog?.kind === 'server' && (
        <ServerEditor server={dialog.server} close={() => setDialog(null)} save={saveServer} />
      )}
      {dialog?.kind === 'subscription' && (
        <SubscriptionEditor
          subscription={dialog.subscription}
          servers={data.servers}
          close={() => setDialog(null)}
          save={saveSubscription}
        />
      )}
      {dialog?.kind === 'import' && (
        <ImportDialog
          server={dialog.server}
          close={() => setDialog(null)}
          copy={(value) => void copy(value)}
        />
      )}
      {dialog?.kind === 'json' && <JsonImport close={() => setDialog(null)} save={saveServer} />}
      {dialog?.kind === 'qr' && (
        <SubscriptionQR
          subscription={dialog.subscription}
          close={() => setDialog(null)}
          copy={(value) => void copy(value)}
        />
      )}
      {dialog?.kind === 'help' && <Help close={() => setDialog(null)} />}
      {dialog?.kind === 'deleteServer' && (
        <ConfirmDialog
          title={`删除「${titleOf(dialog.server)}」？`}
          description="这台服务器会从工作台和后续订阅响应中移除。已经导入到播放器的配置不会被删除。"
          close={() => setDialog(null)}
          confirm={async () => {
            await api(`/api/servers/${dialog.server.id}`, 'DELETE', { version: dialog.server.version });
            setData((previous) => ({
              ...previous,
              servers: previous.servers.filter((item) => item.id !== dialog.server.id),
            }));
            notify('服务器已删除');
          }}
        />
      )}
      {dialog?.kind === 'deleteSubscription' && (
        <ConfirmDialog
          title={`删除「${dialog.subscription.name}」？`}
          description="删除后，此地址将在配置传播完成后停止返回数据。这个后缀可重新分配；仍持有旧链接的客户端届时会读到新订阅，已保存的配置不受影响。"
          close={() => setDialog(null)}
          confirm={async () => {
            await api(`/api/subscriptions/${dialog.subscription.id}`, 'DELETE', {
              version: dialog.subscription.version,
            });
            setData((previous) => ({
              ...previous,
              subscriptions: previous.subscriptions.filter((item) => item.id !== dialog.subscription.id),
            }));
            notify('订阅已删除');
          }}
        />
      )}
    </div>
  );
}
function ServerArt({ server, index }: { server: ServerRecord; index: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`server-art art-${index % 4}`}>
      {server.config.logo && !failed ? (
        <img
          src={server.config.logo}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Server size={25} />
      )}
    </span>
  );
}
function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {icon}
        <span>+</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function App() {
  const [state, setState] = useState<{ configured: boolean; initialized: boolean; loggedIn: boolean } | null>(
    null,
  );
  const [error, setError] = useState('');
  async function start() {
    setError('');
    try {
      const status = await api<{ configured: boolean; initialized: boolean }>('/api/status');
      let loggedIn = false;
      if (status.initialized) {
        try {
          await api('/api/me');
          loggedIn = true;
        } catch {
          /* A missing/expired session returns the login form. */
        }
      }
      setState({ ...status, loggedIn });
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  useEffect(() => {
    void start();
    const expired = () => setState((previous) => (previous ? { ...previous, loggedIn: false } : null));
    window.addEventListener('libra:expired', expired);
    return () => window.removeEventListener('libra:expired', expired);
  }, []);
  if (!state)
    return (
      <div className="boot-screen">
        <Brand />
        {error ? (
          <>
            <Message tone="error">{error}</Message>
            <Button onClick={() => void start()}>重试</Button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  return state.loggedIn ? (
    <Workspace logout={() => setState({ ...state, loggedIn: false })} />
  ) : (
    <Login
      initialized={state.initialized}
      configured={state.configured}
      onLogin={() => setState({ configured: true, initialized: true, loggedIn: true })}
    />
  );
}
createRoot(document.getElementById('root')!).render(<App />);

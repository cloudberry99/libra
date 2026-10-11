import { useState } from 'react';
import {
  ArrowDownToLine,
  Grid2X2,
  Link2,
  List,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Waypoints,
  X,
} from 'lucide-react';
import type { DashboardData, ServerRecord } from '../../shared/types';
import { Spinner, Button, IconButton, Empty } from '../components/ui';
import { titleOf } from '../helpers';
import type { DialogState } from '../types';
import { ServerSort } from '../components/ServerSort';
import { SortableServerCard } from '../components/SortableServerCard';
import { mergeVisibleOrder } from '../../shared/server-order';

export function ServersPage({
  data,
  loading,
  load,
  setDialog,
  toggleServer,
  busyId,
  sorting,
  reorderServers,
}: {
  data: DashboardData;
  loading: boolean;
  load: () => Promise<void>;
  setDialog: (value: DialogState) => void;
  toggleServer: (server: ServerRecord) => Promise<void>;
  busyId: string;
  sorting: boolean;
  reorderServers: (serverIds: string[]) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState('grid');
  const shown = data.servers.filter(
    (server) =>
      (filter === 'all' || server.enabled === (filter === 'enabled')) &&
      `${titleOf(server)} ${server.config.note ?? ''} ${server.config.primary.url} ${server.config.credentials?.username ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activeSubs = data.subscriptions.filter((item) => item.enabled).length;
  return (
    <>
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-icon purple">
            <Server size={21} />
          </span>
          <div>
            <span>服务器总数</span>
            <strong>{loading ? '—' : data.servers.length}</strong>
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
            <strong>{loading ? '—' : activeSubs}</strong>
          </div>
        </div>
      </div>
      <div className="collection-heading">
        <h2>
          我的服务器 <span>{data.servers.length}</span>
        </h2>
        <button
          className="text-button muted-text"
          disabled={sorting}
          onClick={() => setDialog({ kind: 'json' })}
        >
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
            <IconButton label="卡片视图" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>
              <Grid2X2 size={17} />
            </IconButton>
            <IconButton label="列表视图" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>
              <List size={18} />
            </IconButton>
          </div>
          <IconButton label="刷新服务器" disabled={loading || sorting} onClick={() => void load()}>
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
        <ServerSort
          servers={shown}
          save={(ids) =>
            void reorderServers(
              mergeVisibleOrder(
                data.servers.map((server) => server.id),
                ids,
              ),
            )
          }
        >
          <div className={`server-grid ${layout === 'list' ? 'list-layout' : ''}`} aria-busy={sorting}>
            {shown.map((server, index) => (
              <SortableServerCard
                key={server.id}
                server={server}
                index={index}
                busyId={busyId}
                locked={sorting || !!busyId}
                sortable={shown.length > 1}
                setDialog={setDialog}
                toggleServer={toggleServer}
              />
            ))}
          </div>
        </ServerSort>
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
  );
}

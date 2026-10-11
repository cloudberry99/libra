import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpRight, Globe2, GripVertical, Network, Pencil, Server, Trash2, UserRound } from 'lucide-react';
import type { ServerRecord } from '../../shared/types';
import type { DialogState } from '../types';
import { titleOf } from '../helpers';

export function SortableServerCard({
  server,
  index,
  busyId,
  locked,
  sortable,
  setDialog,
  toggleServer,
}: {
  server: ServerRecord;
  index: number;
  busyId: string;
  locked: boolean;
  sortable: boolean;
  setDialog: (value: DialogState) => void;
  toggleServer: (server: ServerRecord) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: server.id,
      disabled: locked || !sortable,
    });
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`server-card ${!server.enabled ? 'disabled-card' : ''} ${isDragging ? 'is-dragging' : ''}`}
      data-server-id={server.id}
    >
      <div className="server-card-top">
        <ServerArt server={server} index={index} />
        <div className="server-title">
          <h3 title={titleOf(server)}>{titleOf(server)}</h3>
          {server.config.note && <span>{server.config.note}</span>}
        </div>
        <div className="server-card-actions">
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            className="server-drag-handle"
            aria-label={`拖动排序 ${titleOf(server)}`}
            aria-roledescription="排序手柄"
            title="拖动排序"
            disabled={locked || !sortable}
          >
            <GripVertical size={17} />
          </button>
        </div>
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
          disabled={locked}
          onClick={() => void toggleServer(server)}
          title={server.enabled ? '点击停用订阅中的配置' : '点击启用配置'}
        >
          <span />
          {busyId === server.id ? '保存中' : server.enabled ? '已启用' : '已停用'}
        </button>
        <div>
          <button
            type="button"
            className="server-edit-button"
            aria-label={`编辑 ${titleOf(server)}`}
            disabled={locked}
            onClick={() => setDialog({ kind: 'server', server })}
          >
            <Pencil size={15} />
            编辑
          </button>
          <button
            type="button"
            className="server-delete-button"
            aria-label={`删除 ${titleOf(server)}`}
            disabled={locked}
            onClick={() => setDialog({ kind: 'deleteServer', server })}
          >
            <Trash2 size={15} />
            删除
          </button>
          <button className="import-button" onClick={() => setDialog({ kind: 'import', server })}>
            导入播放器
            <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
function ServerArt({ server, index }: { server: ServerRecord; index: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`server-art art-${index % 4}`}>
      {server.config.logo && /^https:\/\//i.test(server.config.logo) && !failed ? (
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

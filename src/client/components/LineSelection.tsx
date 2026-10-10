import { useState } from 'react';
import type { Endpoint } from '../../shared/types';
import { Button } from './ui';

export function LineSelection({
  lines,
  capacity,
  add,
  close,
}: {
  lines: Endpoint[];
  capacity: number;
  add: (lines: Endpoint[]) => void;
  close: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const visible = lines.filter((line) =>
    `${line.name ?? ''} ${line.url}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="line-selection" aria-label="选择获取的备用线路">
      <div className="line-selection-heading">
        <strong>发现 {lines.length} 条新线路</strong>
        <span>
          已选 {selected.size} / {capacity}
        </span>
      </div>
      <p>还可添加 {capacity} 条，请选择需要的线路。</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索线路名称或地址"
        aria-label="搜索获取的备用线路"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />
      <div className="line-selection-list">
        {visible.map((line) => (
          <label key={line.url}>
            <input
              type="checkbox"
              checked={selected.has(line.url)}
              disabled={!selected.has(line.url) && selected.size >= capacity}
              onChange={(event) =>
                setSelected((previous) => {
                  const next = new Set(previous);
                  if (event.target.checked) next.add(line.url);
                  else next.delete(line.url);
                  return next;
                })
              }
            />
            <span>
              <strong>{line.name || '未命名线路'}</strong>
              <small>{line.url}</small>
            </span>
          </label>
        ))}
        {!visible.length && <p>没有匹配的线路</p>}
      </div>
      <div className="line-selection-actions">
        <Button variant="ghost" type="button" onClick={close}>
          收起
        </Button>
        <Button
          type="button"
          disabled={!selected.size || selected.size > capacity}
          onClick={() => add(lines.filter((line) => selected.has(line.url)))}
        >
          添加所选线路
        </Button>
      </div>
    </section>
  );
}

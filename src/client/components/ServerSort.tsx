import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import type { ServerRecord } from '../../shared/types';
import { titleOf } from '../helpers';

export function ServerSort({
  servers,
  save,
  children,
}: {
  servers: ServerRecord[];
  save: (ids: string[]) => void;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = servers.find((server) => server.id === activeId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const title = (id: string | number) => {
    const server = servers.find((item) => item.id === id);
    return server ? titleOf(server) : '服务器';
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: {
          draggable: '按空格开始排序，使用方向键移动，再按空格确认，或按 Esc 取消。',
        },
        announcements: {
          onDragStart: ({ active }) => `已选中${title(active.id)}，开始排序。`,
          onDragOver: ({ over }) =>
            over ? `移动到第 ${servers.findIndex((item) => item.id === over.id) + 1} 位。` : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${title(active.id)}已放到第 ${servers.findIndex((item) => item.id === over.id) + 1} 位。`
              : '排序已取消。',
          onDragCancel: () => '排序已取消。',
        },
      }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        if (!over || active.id === over.id) return;
        const from = servers.findIndex((server) => server.id === active.id);
        const to = servers.findIndex((server) => server.id === over.id);
        if (from !== -1 && to !== -1) save(arrayMove(servers, from, to).map((server) => server.id));
      }}
    >
      <SortableContext items={servers} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="server-drag-preview" aria-hidden="true">
            <GripVertical size={20} />
            <strong>{titleOf(active)}</strong>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

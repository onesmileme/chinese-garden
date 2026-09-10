import type { AdminContentItem } from "@cc/api-client";
import { Pencil } from "lucide-react";

interface ContentTableProps {
  items: AdminContentItem[];
  canEdit: boolean;
  onEdit: (item: AdminContentItem) => void;
}

function itemLabel(item: AdminContentItem): string {
  if (item.type === "CHARACTER") {
    return String(item.payload.char);
  }
  if (item.type === "POEM") {
    return String(item.payload.title);
  }
  return String(item.payload.text);
}

export function ContentTable({ items, canEdit, onEdit }: ContentTableProps) {
  return (
    <div className="table-scroll">
      <table className="content-table">
        <thead>
          <tr>
            <th scope="col">内容</th>
            <th scope="col">ID</th>
            <th scope="col">等级</th>
            <th scope="col">难度</th>
            <th scope="col">状态</th>
            <th scope="col">修订</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const label = itemLabel(item);
            return (
              <tr key={item.id}>
                <td className="content-primary">{label}</td>
                <td className="content-id">{item.id}</td>
                <td>{item.level}</td>
                <td>{item.difficulty}</td>
                <td>
                  <span className={`status-badge status-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </td>
                <td>r{item.revision}</td>
                <td>
                  <button
                    aria-label={`${canEdit ? "编辑" : "查看"} ${label}`}
                    className="icon-button"
                    onClick={() => onEdit(item)}
                    title={`${canEdit ? "编辑" : "查看"} ${label}`}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

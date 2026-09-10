import type { ContentType } from "@cc/api-client";
import type { ContentFilters as ContentFilterValues } from "../use-content-library";

const TYPES = [
  ["CHARACTER", "汉字"],
  ["POEM", "古诗词"],
  ["IDIOM", "成语"],
] as const;

interface ContentFiltersProps {
  type: ContentType;
  filters: ContentFilterValues;
  onTypeChange: (type: ContentType) => void;
  onFilterChange: (
    name: keyof ContentFilterValues,
    value: ContentFilterValues[keyof ContentFilterValues],
  ) => void;
}

export function ContentFilters({
  type,
  filters,
  onTypeChange,
  onFilterChange,
}: ContentFiltersProps) {
  return (
    <div className="content-filter-bar">
      <div aria-label="内容类型" className="content-tabs" role="tablist">
        {TYPES.map(([value, label]) => (
          <button
            aria-selected={type === value}
            className="content-tab"
            key={value}
            onClick={() => onTypeChange(value)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-controls">
        <label>
          <span>等级</span>
          <select
            onChange={(event) =>
              onFilterChange(
                "level",
                event.currentTarget.value as ContentFilterValues["level"],
              )
            }
            value={filters.level}
          >
            <option value="">全部</option>
            {["L1", "L2", "L3", "L4", "L5"].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>状态</span>
          <select
            onChange={(event) =>
              onFilterChange(
                "status",
                event.currentTarget.value as ContentFilterValues["status"],
              )
            }
            value={filters.status}
          >
            <option value="">全部</option>
            <option value="DRAFT">草稿</option>
            <option value="ACTIVE">已激活</option>
            <option value="ARCHIVED">已归档</option>
          </select>
        </label>
        <label>
          <span>标签</span>
          <input
            onChange={(event) =>
              onFilterChange("tag", event.currentTarget.value)
            }
            placeholder="精确标签"
            value={filters.tag}
          />
        </label>
        <label className="keyword-filter">
          <span>关键词</span>
          <input
            onChange={(event) =>
              onFilterChange("keyword", event.currentTarget.value)
            }
            placeholder="ID 或内容"
            type="search"
            value={filters.keyword}
          />
        </label>
      </div>
    </div>
  );
}

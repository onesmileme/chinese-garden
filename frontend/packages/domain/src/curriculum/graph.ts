import type { KnowledgePointId } from "@cc/content-schema";

export interface GraphNode {
  id: KnowledgePointId;
  prerequisites: KnowledgePointId[];
}
export interface GraphIssues {
  cycles: KnowledgePointId[][];
  deadLinks: KnowledgePointId[];
  unreachable: KnowledgePointId[];
}

export function validateGraph(
  nodes: GraphNode[],
  roots: KnowledgePointId[],
): GraphIssues {
  const byId = new Map<KnowledgePointId, GraphNode>();
  for (const n of nodes) byId.set(n.id, n);

  // 断链：指向不存在节点的前置。
  const deadLinks: KnowledgePointId[] = [];
  for (const n of nodes) {
    for (const p of n.prerequisites) {
      if (!byId.has(p) && !deadLinks.includes(p)) deadLinks.push(p);
    }
  }

  // 环检测：以 prerequisite 为边，DFS 三色标记。
  const cycles: KnowledgePointId[][] = [];
  const color = new Map<KnowledgePointId, 0 | 1 | 2>();
  const stack: KnowledgePointId[] = [];
  const dfs = (id: KnowledgePointId): void => {
    color.set(id, 1);
    stack.push(id);
    // dfs 只对存在于 byId 的 id 调用（外层遍历 nodes，内层递归前有 byId.has 守卫），故直接取。
    for (const p of byId.get(id)!.prerequisites) {
      if (!byId.has(p)) continue;
      const c = color.get(p) ?? 0;
      if (c === 0) dfs(p);
      else if (c === 1) {
        const start = stack.indexOf(p);
        cycles.push(stack.slice(start));
      }
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const n of nodes) if ((color.get(n.id) ?? 0) === 0) dfs(n.id);

  // 不可达：从 roots 沿「后继」方向（prerequisite 的反向）可达的节点之外的节点。
  const forward = new Map<KnowledgePointId, KnowledgePointId[]>();
  for (const n of nodes)
    for (const p of n.prerequisites) {
      if (!forward.has(p)) forward.set(p, []);
      forward.get(p)!.push(n.id);
    }
  const seen = new Set<KnowledgePointId>();
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur) || !byId.has(cur)) continue;
    seen.add(cur);
    for (const next of forward.get(cur) ?? []) queue.push(next);
  }
  const unreachable = nodes.map((n) => n.id).filter((id) => !seen.has(id));

  return { cycles, deadLinks, unreachable };
}

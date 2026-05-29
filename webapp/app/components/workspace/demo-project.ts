import type { CodeFile } from "../../types/exerpt";

export const demoProject: CodeFile[] = [
  {
    name: "src/exerpt/engine.py",
    content: `from exerpt.graph import DependencyGraph
from exerpt.ranker import rank_for_task

class ExerptEngine:
    def build_prompt(self, files, task, limit):
        graph = DependencyGraph.from_files(files)
        ranked = rank_for_task(graph, task)
        return self.render_context(ranked, limit)

    def render_context(self, ranked_files, limit):
        return "\\n".join(file.focused() for file in ranked_files)`
  },
  {
    name: "src/exerpt/graph.py",
    content: `import ast
import networkx as nx

class DependencyGraph:
    @classmethod
    def from_files(cls, files):
        graph = nx.DiGraph()
        for file in files:
            graph.add_node(file.name)
            for import_path in cls.imports_for(file.content):
                graph.add_edge(file.name, import_path)
        return graph

    @staticmethod
    def imports_for(source):
        tree = ast.parse(source)
        return [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]`
  },
  {
    name: "src/exerpt/ranker.py",
    content: `def rank_for_task(graph, task):
    task_words = set(task.lower().split())
    ranked = []
    for node in graph.nodes:
        score = sum(1 for word in task_words if word in node.lower())
        ranked.append((score, node))
    return [node for _, node in sorted(ranked, reverse=True)]`
  },
  {
    name: "tests/test_graph.py",
    content: `from exerpt.graph import DependencyGraph

def test_dependency_graph_reads_python_imports():
    files = [type("File", (), {"name": "engine.py", "content": "from exerpt.graph import DependencyGraph"})]
    graph = DependencyGraph.from_files(files)
    assert "engine.py" in graph.nodes`
  }
];

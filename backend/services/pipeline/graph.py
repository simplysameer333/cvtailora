"""LangGraph graph definition for the TailorMyCv evaluator-optimizer pipeline.

Graph topology (compiled once at import time, reused for every request):
  generate → evaluate → aggregate → [conditional] → generate (loop) or END

The compiled `pipeline` object is the single entry point used by the router:
    final_state = await pipeline.ainvoke(initial_state)
"""
from langgraph.graph import StateGraph, END
from .state import PipelineState
from .nodes import generate_node, evaluate_node, aggregate_node, should_continue


def build_pipeline() -> object:
    """Assemble and compile the LangGraph StateGraph.

    Returns a compiled graph that accepts PipelineState and runs the
    generate → evaluate → aggregate loop until all evaluators pass or
    MAX_CYCLES is reached.
    """
    graph = StateGraph(PipelineState)

    graph.add_node("generate", generate_node)
    graph.add_node("evaluate", evaluate_node)
    graph.add_node("aggregate", aggregate_node)

    graph.set_entry_point("generate")
    graph.add_edge("generate", "evaluate")
    graph.add_edge("evaluate", "aggregate")
    graph.add_conditional_edges(
        "aggregate",
        should_continue,
        {"generate": "generate", "end": END},
    )

    return graph.compile()


pipeline = build_pipeline()

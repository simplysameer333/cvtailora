"""SectionGeneratorNode — writes ONE resume section with one focused LLM call.

CV Build fans these out: independent sections (contact, experience, education)
run fully in parallel; a section that genuinely needs another's output declares
it in `depends_on` (skills → experience; summary → experience + skills), so the
runner connects them only where required and the graph shows exactly those
edges. The candidate corpus is the cached shared prefix across every section.
"""
from __future__ import annotations

from ..prompts import SECTION_BY_KEY, section_system, section_task
from ..runner import NodeOutput, NodeRun
from ..state import NodeCost
from ..validators import validate_section_output


def _dep_context(deps: dict[str, NodeOutput]) -> str:
    """Fold already-generated dependency sections into a small uncached suffix so
    a dependent generator can align to them (kept short — the big corpus is
    cached separately)."""
    if not deps:
        return ""
    lines = ["\n\n=== ALREADY-WRITTEN SECTIONS (align to these) ==="]
    for dep_id, out in deps.items():
        key = dep_id.split(":", 1)[-1]
        label = SECTION_BY_KEY.get(key, {}).get("label", key)
        content = (out.content or {}).get("content") if isinstance(out.content, dict) else out.content
        lines.append(f"[{label}] {content}")
    return "\n".join(lines)


def make_section_generator(*, section_key: str, corpus: str, llm=None,
                           max_tokens: int = 900, model: str | None = None) -> NodeRun:
    """Return the async NodeRun that writes `section_key` from `corpus`.

    Prompts resolve from MongoDB (admin override → code default) at run time."""

    async def _run(deps: dict[str, NodeOutput]) -> NodeOutput:
        client = llm
        if client is None:
            from services.llm import gateway as _gw  # _gw IS the gateway singleton
            client = _gw
        task = (await section_task(section_key)) + _dep_context(deps)
        res = await client.complete(
            system=await section_system(),
            cached_context=corpus,
            task=task,
            max_tokens=max_tokens,
            model=model,
            force_json=True,
        )
        result, ev = validate_section_output(res.text, section_key)
        cost = NodeCost(
            input_tokens=res.input_tokens, output_tokens=res.output_tokens,
            cache_read_tokens=res.cache_read_tokens, cache_write_tokens=res.cache_write_tokens,
            usd=res.cost_usd, llm_calls=1,
        )
        return NodeOutput(content=result, score=None, cost=cost, evals=[ev],
                          detail={"section": section_key}, latency_ms=res.latency_ms)

    return _run

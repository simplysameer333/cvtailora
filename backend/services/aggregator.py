from typing import List, Dict

PASS_THRESHOLD = 95


def aggregate_results(evaluator_results: List[Dict]) -> Dict:
    scores = [r["score"] for r in evaluator_results]
    min_score = min(scores) if scores else 0
    all_passed = all(s >= PASS_THRESHOLD for s in scores)

    lines = ["The following evaluators reviewed the resume and provided feedback:"]
    seen: set = set()
    for r in evaluator_results:
        lines.append(f"\n**{r['model'].upper()} (score: {r['score']}/100):**")
        for suggestion in r.get("suggestions", []):
            if suggestion not in seen:
                seen.add(suggestion)
                lines.append(f"- {suggestion}")

    return {
        "all_passed": all_passed,
        "min_score": min_score,
        "feedback_prompt": "\n".join(lines),
        "evaluator_results": evaluator_results,
    }

"""Fallback profession config — used when no profession matches the target role."""

CONFIG = {
    "slug": "generic",
    "display_name": "General",
    "keywords": [],
    "generator_context": "",
    "evaluator_context": "",
    "scoring_criteria": (
        "Scoring criteria (0–100):\n"
        "- Keyword alignment with job description (30 pts)\n"
        "- Strength of action verbs and impact quantification (20 pts)\n"
        "- Relevance and ordering of experience (20 pts)\n"
        "- Summary quality and clarity (15 pts)\n"
        "- Skills section completeness (15 pts)"
    ),
    "aggregator_context": "",
    # Empty = use all configured evaluators. Specify names to restrict per profession.
    "evaluator_names": [],
    "is_active": True,
}

"""Profession config for Software Engineer roles.

Covers: backend, frontend, fullstack, mobile, DevOps, ML, data engineers.
Keywords are matched case-insensitively against user_profile.target_role.
"""

CONFIG = {
    "slug": "software_engineer",
    "display_name": "Software Engineer",
    "keywords": [
        "software", "developer", "engineer", "programmer", "backend", "frontend",
        "fullstack", "full-stack", "full stack", "devops", "sre", "platform",
        "data engineer", "ml engineer", "machine learning", "mobile", "ios", "android",
    ],
    "generator_context": (
        "PROFESSION-SPECIFIC GUIDANCE — Software Engineering:\n"
        "- Name the exact technologies, frameworks, and versions used in each role\n"
        "- Quantify engineering impact: system scale (users, RPS, data volume), latency "
        "improvements (ms or %), cost savings ($), uptime (SLA %)\n"
        "- Lead bullets with strong engineering verbs: Architected, Engineered, Optimised, "
        "Shipped, Refactored, Scaled, Automated, Migrated\n"
        "- Surface system design decisions and ownership signals (designed, led, owned)\n"
        "- Include open-source contributions, GitHub URL, or portfolio link in contact section\n"
        "- List relevant certifications: AWS, GCP, Azure, CKA, Kubernetes, etc."
    ),
    "evaluator_context": (
        "PROFESSION-SPECIFIC EVALUATION — Software Engineering:\n"
        "Adjust your evaluation lens for a technical role. Probe specifically for:\n"
        "- Are technologies and tools named precisely (not just 'databases' — say PostgreSQL/Redis)?\n"
        "- Is engineering impact quantified (scale, performance gains, cost reduction)?\n"
        "- Does the tech stack in the resume overlap with the JD's requirements?\n"
        "- Are there ownership and leadership signals (architected, led, owned vs. contributed to)?\n"
        "- Is there a GitHub, portfolio, or open-source presence?"
    ),
    "scoring_criteria": (
        "Scoring criteria (0–100) for a Software Engineering role:\n"
        "- Technical specificity: named technologies, tools, versions matching the JD (25 pts)\n"
        "- Quantified engineering impact: scale, performance, cost, reliability metrics (25 pts)\n"
        "- JD tech stack alignment: candidate stack vs. required/preferred stack (20 pts)\n"
        "- Ownership and architecture signals: led/designed vs. just participated (15 pts)\n"
        "- Online presence and credentials: GitHub, portfolio, certifications (15 pts)"
    ),
    "aggregator_context": (
        "Focus improvement suggestions on:\n"
        "1. Adding specific technology names where the resume uses generic terms\n"
        "2. Injecting quantified metrics into bullets that currently describe actions without outcomes\n"
        "3. Strengthening ownership language (replace 'worked on' with 'led', 'owned', 'designed')\n"
        "4. Surfacing keywords from the JD's tech stack that exist in the candidate's background "
        "but are not yet highlighted"
    ),
    # Empty = use all configured evaluators for this profession.
    "evaluator_names": [],
    "is_active": True,
}

"""Profession config for Hospitality and Hotel Management roles.

Covers: hotel manager, general manager, front office, F&B director,
revenue manager, housekeeping manager, resort operations.
"""

CONFIG = {
    "slug": "hotel_management",
    "display_name": "Hotel Management",
    "keywords": [
        "hotel", "hospitality", "general manager", "front office", "revenue manager",
        "f&b", "food and beverage", "housekeeping", "resort", "lodging",
        "accommodation", "guest services", "rooms division", "hotel operations",
    ],
    "generator_context": (
        "PROFESSION-SPECIFIC GUIDANCE — Hotel Management & Hospitality:\n"
        "- Lead with measurable KPIs: guest satisfaction scores (NPS, TripAdvisor rating, "
        "brand audit %), occupancy rate, RevPAR, ADR, GOP margin\n"
        "- Quantify operations scale: number of rooms, team size, F&B covers, annual revenue managed\n"
        "- Name brand experience explicitly: Marriott, Hilton, IHG, Four Seasons, independent luxury, etc.\n"
        "- Include professional certifications: CHA (Certified Hotel Administrator), CRME, "
        "F&B credentials, sommelier, food safety\n"
        "- Surface multilingual capabilities and cultural competency\n"
        "- Highlight crisis, complaint resolution, and VIP/diplomatic guest handling with outcomes"
    ),
    "evaluator_context": (
        "PROFESSION-SPECIFIC EVALUATION — Hotel Management & Hospitality:\n"
        "Adjust your evaluation lens for a hospitality leadership role. Probe specifically for:\n"
        "- Are revenue and KPI metrics present (RevPAR, ADR, occupancy %, guest satisfaction scores)?\n"
        "- Is the scale of operations clear (rooms, team headcount, revenue budget)?\n"
        "- Are brand names mentioned and relevant to the employer's segment (luxury, midscale, budget)?\n"
        "- Are professional certifications (CHA, etc.) listed?\n"
        "- Is there evidence of stakeholder management (owner relations, department heads, GMs)?"
    ),
    "scoring_criteria": (
        "Scoring criteria (0–100) for a Hotel Management role:\n"
        "- Revenue and KPI impact: RevPAR, ADR, occupancy %, cost-per-room metrics (25 pts)\n"
        "- Guest satisfaction: NPS, CSAT scores, brand standard audit results (25 pts)\n"
        "- Scale of operations: team size, room count, F&B volume, revenue managed (20 pts)\n"
        "- Brand and certifications: luxury/relevant brand experience, CHA or equivalent (15 pts)\n"
        "- Leadership and stakeholder management: owner relations, exec committee experience (15 pts)"
    ),
    "aggregator_context": (
        "Focus improvement suggestions on:\n"
        "1. Missing KPI data — identify bullets that describe actions without the business outcome\n"
        "2. Vague scale descriptions — push for room counts, team sizes, revenue figures\n"
        "3. Brand alignment — surface relevant brand experience that matches the employer's segment\n"
        "4. Guest satisfaction evidence — if scores or ratings exist in the inputs, ensure they appear"
    ),
    # Empty = use all configured evaluators for this profession.
    "evaluator_names": [],
    "is_active": True,
}

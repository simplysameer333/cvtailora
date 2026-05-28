"""Profession config for Animation and Creative roles.

Covers: 3D animator, motion graphics, VFX, character animator, storyboard artist,
concept artist, creative director, visual effects.
"""

CONFIG = {
    "slug": "animator",
    "display_name": "Animator / Creative",
    "keywords": [
        "animator", "animation", "motion graphics", "vfx", "visual effects",
        "3d artist", "character animator", "storyboard", "concept artist",
        "creative director", "motion designer", "compositor", "rigger",
        "after effects", "blender", "maya", "cinema 4d",
    ],
    "generator_context": (
        "PROFESSION-SPECIFIC GUIDANCE — Animation & Creative:\n"
        "- List software proficiency prominently in skills: Blender, Maya, Cinema 4D, "
        "After Effects, Nuke, Substance Painter, ZBrush, Photoshop, etc.\n"
        "- Name production credits with studio, title, release year, and your specific role\n"
        "- Quantify output where possible: shots delivered, episode count, tight deadlines, "
        "view counts or audience reach for released work\n"
        "- Include portfolio or showreel URL prominently in the contact section — this is "
        "the single most important element for a creative role\n"
        "- Highlight style range: character animation, motion graphics, VFX, 2D/3D, etc.\n"
        "- Surface collaboration signals: worked under directors, with leads, cross-department"
    ),
    "evaluator_context": (
        "PROFESSION-SPECIFIC EVALUATION — Animation & Creative:\n"
        "Adjust your evaluation lens for a creative role. Probe specifically for:\n"
        "- Is there a portfolio or showreel link? This is non-negotiable for creative roles.\n"
        "- Are software tools listed and relevant to what the JD requires?\n"
        "- Are production credits specific (named projects/studios vs. vague 'worked in animation')?\n"
        "- Does the style range or specialisation match what the JD is looking for?\n"
        "- Are collaboration and pipeline experience signals present?"
    ),
    "scoring_criteria": (
        "Scoring criteria (0–100) for an Animation / Creative role:\n"
        "- Portfolio/showreel presence: link included and accessible (25 pts)\n"
        "- Software proficiency: tools listed and matching the JD's requirements (25 pts)\n"
        "- Production credits: named projects, studios, recognisable or quantified work (20 pts)\n"
        "- Style and specialisation fit: does the profile match the JD's animation style need (15 pts)\n"
        "- Collaboration and pipeline experience: directors, leads, cross-functional (15 pts)"
    ),
    "aggregator_context": (
        "Focus improvement suggestions on:\n"
        "1. Portfolio/showreel visibility — if missing or buried, flag this as the top priority\n"
        "2. Software tools matching the JD — list tools the candidate has but hasn't named\n"
        "3. Vague production credits — push for project names, studio names, or release context\n"
        "4. Style or specialisation gaps — highlight where the candidate's range matches JD needs "
        "but isn't made explicit"
    ),
    # Empty = use all configured evaluators for this profession.
    "evaluator_names": [],
    "is_active": True,
}

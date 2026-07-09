"""Unit tests for the deterministic job-match scorer (J3 card badges)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.job_match_service import compute_match, annotate_jobs


PROFILE = {
    "key_skills": ["Python", "FastAPI", "MongoDB", "Docker"],
    "primary_skill": "Python",
    "target_roles": ["Backend Developer"],
}

JOB = {
    "job_title": "Senior Backend Developer",
    "job_description": "We need strong Python and FastAPI experience. MongoDB a plus.",
    "job_highlights": {"Qualifications": ["5+ years Python"], "Responsibilities": ["Build APIs"]},
    "job_required_skills": None,
}


def test_strong_match_scores_high():
    m = compute_match(PROFILE, JOB)
    assert m is not None
    # 3 of 4 skills present (python double-weighted: 4/5 hits) + full role overlap
    assert m["pct"] >= 75
    assert m["label"] in ("Excellent match", "Strong match")
    assert "Python" in m["matched_skills"]
    assert "Docker" not in m["matched_skills"]


def test_unrelated_job_scores_low():
    job = {
        "job_title": "Registered Nurse",
        "job_description": "Patient care in a busy hospital ward.",
    }
    m = compute_match(PROFILE, job)
    assert m is not None
    assert m["pct"] < 40
    assert m["label"] == "Low match"


def test_no_profile_signals_returns_none():
    assert compute_match({}, JOB) is None
    assert compute_match({"key_skills": [], "target_roles": []}, JOB) is None


def test_no_job_text_returns_none():
    assert compute_match(PROFILE, {"job_title": "", "job_description": ""}) is None


def test_primary_skill_weighted_double():
    profile = {"key_skills": ["Python", "Kubernetes"], "primary_skill": "Python", "target_roles": []}
    job = {"job_title": "Engineer", "job_description": "python role"}
    m = compute_match(profile, job)
    # primary hit = 2 weight points × 25 = 50 raw → sqrt curve → 71%
    assert m["pct"] == 71


def test_title_only_match_reads_strong():
    """A job titled exactly the target role must read encouraging even when
    the JD text names none of the user's skills (max-favoring blend).
    Synonyms are DATA passed in — nothing role-related is hardcoded."""
    profile = {"key_skills": ["Java", "Chronicle"], "primary_skill": "Java",
               "target_roles": ["Vice-president, Global Lead"]}
    job = {
        "job_title": "VP, Global Lead",  # "VP" must expand via synonyms data
        "job_description": "Own global governance and stakeholder reporting.",
    }
    m = compute_match(profile, job, synonyms={"vp": ["vice", "president"]})
    # skills 0, role 100 → raw 70 → curve ≈ 84
    assert m["pct"] >= 80
    assert m["label"] == "Excellent match"


def test_default_synonyms_seed_covers_vp():
    """The seeded system_config data must expand vp — the scorer itself
    carries no role knowledge."""
    from services.system_config_service import DEFAULTS
    syn = DEFAULTS["match_token_synonyms"]
    assert syn["vp"] == ["vice", "president"]


def test_long_skill_list_does_not_dilute_score():
    """A profile with MANY skills must not score lower than a short one when
    the same skills match — the original fraction-based scoring did (10% on
    a genuinely good job)."""
    job = {
        "job_title": "Java Developer",
        "job_description": "Java and Spring experience required, AWS a plus.",
    }
    short = {"key_skills": ["Java", "Spring", "AWS"], "primary_skill": "Java", "target_roles": []}
    long_ = {
        "key_skills": [
            "Java", "Spring", "AWS", "Chronicle", "LMAX", "Kafka", "Solace",
            "Grafana", "Kubernetes", "Docker", "MongoDB", "Python",
        ],
        "primary_skill": "Java",
        "target_roles": [],
    }
    assert compute_match(long_, job)["pct"] == compute_match(short, job)["pct"] == 100


def test_special_char_skills_match_on_edges():
    profile = {"key_skills": ["C++"], "primary_skill": "", "target_roles": []}
    hit = {"job_title": "Dev", "job_description": "Modern C++ development"}
    miss = {"job_title": "Dev", "job_description": "C developer wanted"}
    assert "C++" in compute_match(profile, hit)["matched_skills"]
    assert compute_match(profile, miss)["matched_skills"] == []


def test_substring_does_not_false_match():
    profile = {"key_skills": ["Java"], "primary_skill": "", "target_roles": []}
    job = {"job_title": "Dev", "job_description": "JavaScript only"}
    assert compute_match(profile, job)["matched_skills"] == []


def test_annotate_jobs_in_place_and_skips_without_profile():
    jobs = [dict(JOB)]
    annotate_jobs(PROFILE, jobs)
    assert "match" in jobs[0]

    jobs2 = [dict(JOB)]
    annotate_jobs(None, jobs2)
    assert "match" not in jobs2[0]

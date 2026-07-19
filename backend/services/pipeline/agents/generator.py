from __future__ import annotations
from .base import BaseAgent
from ..prompts.anthropic import generator_messages, section_messages
from ..utils import parse_json_response
from ..telemetry import record as record_usage
from config import settings


class GeneratorAgent(BaseAgent):
    """Writes a tailored resume JSON from candidate inputs.

    Two entry points:
    - run()          — full resume generation, called each cycle by the LangGraph pipeline.
                       Accepts optional aggregator feedback to address evaluator suggestions.
    - run_section()  — single-section regeneration, bypasses the evaluation pipeline entirely.

    Both accept profession_config so prompts are tailored to the candidate's target profession,
    and key_skills so the job-analyzer's pre-selected priorities are injected into every cycle.
    Model is read from settings.generator_model — swap it in .env with no code changes.
    """

    name = "generator"

    def _model(self, max_tokens: int = 3000, timeout: int = 60):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=settings.generator_model,
            api_key=settings.anthropic_api_key,
            max_tokens=max_tokens,
            max_retries=0,   # pipeline handles retry cycles; no LangChain retries
            timeout=timeout,
        )

    async def run(
        self,
        resume_text: str,
        user_profile: dict,
        job_description: str,
        tone: str,
        profession_config: dict,
        locked_facts: list | None = None,
        key_skills: list | None = None,
        sample_cv_text: str | None = None,
        feedback: str | None = None,
        template_pages: int = 2,
    ) -> dict:
        messages = await generator_messages(
            resume_text, user_profile, job_description, tone, feedback,
            profession_config, locked_facts or [], key_skills or [], sample_cv_text,
            template_pages=template_pages,
        )
        response = await self._model().ainvoke(messages)
        record_usage(settings.generator_model, self.name, response)
        return parse_json_response(response.content)

    async def run_patch(
        self,
        resume_text: str,
        user_profile: dict,
        job_description: str,
        tone: str,
        feedback: str,
        current_resume: dict,
        patch_keys: list[str],
        profession_config: dict,
        locked_facts: list | None = None,
        key_skills: list | None = None,
        template_pages: int = 2,
    ) -> dict:
        """Regenerate only the failing sections and merge into the current resume.

        Output is 200–600 tokens instead of 2000–3000, so each patch cycle
        runs in ~8 s instead of ~30 s. Falls back to returning current_resume
        unchanged if the model response can't be parsed.
        """
        from ..prompts.anthropic import patch_messages as _patch_messages
        messages = await _patch_messages(
            resume_text, user_profile, job_description, tone, feedback,
            current_resume, patch_keys, profession_config,
            locked_facts or [], key_skills or [], template_pages,
        )
        # Budget sized for the LARGEST patch (experience + sections of a long
        # CV): 1500 truncated real patches mid-JSON (prod 2026-07-19).
        response = await self._model(max_tokens=2500, timeout=60).ainvoke(messages)
        record_usage(settings.generator_model, self.name, response)
        try:
            patch = parse_json_response(response.content)
        except Exception:
            # parse_json_response RAISES on unparseable/empty content, so the
            # isinstance fallback below never fired — a bad patch response
            # crashed the whole attempt (prod 2026-07-19: 3 identical crashes
            # → permanent failure despite a best=87 checkpoint). A patch has a
            # safe value by definition: keep the last good resume and let the
            # loop evaluate/continue. Log enough to diagnose the bad response.
            import logging
            logging.getLogger("cvtailora").warning(
                "[generator] patch response unparseable (len=%s, stop=%s) — keeping current resume",
                len(response.content or ""),
                (getattr(response, "response_metadata", {}) or {}).get("stop_reason"),
            )
            return current_resume
        if not isinstance(patch, dict):
            return current_resume  # safe fallback — use last good result
        result = dict(current_resume)
        for key, value in patch.items():
            if value is not None:
                result[key] = value
        return result

    async def run_trim(
        self,
        resume_json: dict,
        template_pages: int,
        overflow_note: str,
    ) -> dict:
        """One-shot layout trim: cut/tighten content to fit the page budget.

        Fires only when the deterministic layout validator flags overflow. Returns
        the trimmed resume, or the original unchanged if the response can't be
        parsed (never worse than the input).
        """
        from ..prompts.anthropic import trim_messages
        messages = await trim_messages(resume_json, template_pages, overflow_note)
        response = await self._model(max_tokens=3000, timeout=60).ainvoke(messages)
        record_usage(settings.generator_model, "generator_trim", response)
        try:
            trimmed = parse_json_response(response.content)
        except Exception:
            return resume_json  # same latent raise-before-fallback bug as run_patch
        return trimmed if isinstance(trimmed, dict) and trimmed.get("experience") else resume_json

    async def run_section(
        self,
        resume_text: str,
        user_profile: dict,
        job_description: str,
        tone: str,
        section: str,
        existing_resume: dict,
        profession_config: dict,
        locked_facts: list | None = None,
        key_skills: list | None = None,
        sample_cv_text: str | None = None,
    ) -> dict:
        messages = await section_messages(
            resume_text, user_profile, job_description, tone, section,
            existing_resume, profession_config, locked_facts or [], key_skills or [],
            sample_cv_text,
        )
        response = await self._model().ainvoke(messages)
        record_usage(settings.generator_model, self.name, response)
        return parse_json_response(response.content)

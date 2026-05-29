import logging

import httpx

logger = logging.getLogger("tailormycv")


async def send_quality_alert(session_id: str, aggregated: dict, resume_json: dict) -> None:
    """Log a quality alert warning. Email delivery is log-only."""
    scores = [
        f"{r['model'].upper()}={r['score']}/100"
        for r in aggregated.get("evaluator_results", [])
    ]
    logger.warning(
        "[quality-alert] session=%s min_score=%s all_passed=%s evaluators=[%s]",
        session_id,
        aggregated.get("min_score"),
        aggregated.get("all_passed"),
        ", ".join(scores),
    )


async def send_job_alert_email(
    user_email: str,
    user_name: str,
    alert_name: str,
    jobs: list[dict],
    frontend_url: str = "https://tailormycv.com",
) -> bool:
    """Send a daily job alert digest via Brevo HTTP API. Returns True on success."""
    from config import settings

    if not settings.brevo_api_key:
        raise RuntimeError("BREVO_API_KEY is not set — add it to .env and Railway")

    html = _render_alert_email(user_name, alert_name, jobs, frontend_url)
    subject = (
        f"Your job alert: {alert_name} — "
        f"{len(jobs)} new listing{'s' if len(jobs) != 1 else ''}"
    )

    payload = {
        "sender": {"name": "TailorMyCv Alerts", "email": settings.brevo_sender_email},
        "to": [{"email": user_email, "name": user_name}],
        "subject": subject,
        "htmlContent": html,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                json=payload,
                headers={"api-key": settings.brevo_api_key, "Content-Type": "application/json"},
            )
            resp.raise_for_status()
        logger.info("[job-alert] Sent alert email to %s via Brevo", user_email)
        return True
    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        logger.error("[job-alert] Brevo HTTP %s for %s: %s", exc.response.status_code, user_email, body)
        raise RuntimeError(f"Brevo {exc.response.status_code}: {body}") from exc
    except Exception as exc:
        logger.error("[job-alert] Brevo error sending to %s: %s", user_email, exc)
        raise RuntimeError(str(exc)) from exc


def _render_alert_email(
    user_name: str,
    alert_name: str,
    jobs: list[dict],
    frontend_url: str,
) -> str:
    job_cards_html = ""
    emp_type_map = {
        "FULLTIME": "Full-time",
        "PARTTIME": "Part-time",
        "CONTRACTOR": "Contract",
        "INTERN": "Internship",
    }

    for job in jobs:
        title = job.get("job_title", "Untitled Role")
        employer = job.get("employer_name", "")
        location = ", ".join(filter(None, [job.get("job_city"), job.get("job_country")]))
        emp_type = emp_type_map.get(job.get("job_employment_type", ""), "")
        is_remote = job.get("job_is_remote", False)
        apply_link = job.get("job_apply_link") or f"{frontend_url}/jobs"
        if apply_link == "#":
            apply_link = f"{frontend_url}/jobs"

        meta_parts = list(filter(None, [location, emp_type, "Remote" if is_remote else ""]))
        meta_html = (
            f'<div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">'
            f'{"&nbsp;&middot;&nbsp;".join(meta_parts)}</div>'
            if meta_parts else ""
        )

        job_cards_html += f"""
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;
                    margin-bottom:12px;background:#fff;">
          <div style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:3px;">{title}</div>
          <div style="font-size:13px;color:#475569;margin-bottom:6px;">{employer}</div>
          {meta_html}
          <a href="{apply_link}"
             style="display:inline-block;background:#2B579A;color:#fff;font-size:13px;
                    font-weight:600;padding:8px 18px;border-radius:8px;text-decoration:none;">
            View &amp; Apply
          </a>
        </div>"""

    count = len(jobs)
    count_label = f"{count} new listing{'s' if count != 1 else ''}"

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;
             background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <div style="background:#2B579A;border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">TailorMyCv</div>
      <div style="font-size:13px;color:#bfdbfe;margin-top:4px;">Your daily job alert</div>
    </div>

    <div style="background:#f8fafc;padding:28px 32px 16px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 6px;">Hi {user_name},</p>
      <p style="font-size:14px;color:#475569;margin:0 0 24px;">
        We found <strong>{count_label}</strong> matching your alert
        <strong>&ldquo;{alert_name}&rdquo;</strong>.
      </p>

      {job_cards_html}

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="{frontend_url}/jobs"
           style="display:inline-block;background:#f1f5f9;color:#2B579A;font-size:14px;
                  font-weight:600;padding:12px 28px;border-radius:10px;
                  text-decoration:none;border:1px solid #e2e8f0;">
          Search more jobs on TailorMyCv &rarr;
        </a>
      </div>
    </div>

    <div style="background:#f1f5f9;border-radius:0 0 16px 16px;
                padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        You&rsquo;re receiving this because you set up a job alert on TailorMyCv.<br>
        <a href="{frontend_url}/jobs" style="color:#64748b;">Manage your alerts</a>
      </p>
    </div>

  </div>
</body>
</html>"""

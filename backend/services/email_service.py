import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

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
    """Send a daily job alert digest via SMTP. Returns True on success."""
    from config import settings

    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password]):
        logger.warning(
            "[job-alert] SMTP not configured — skipping email to %s. "
            "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env.",
            user_email,
        )
        return False

    html = _render_alert_email(user_name, alert_name, jobs, frontend_url)
    subject = (
        f"Your job alert: {alert_name} — "
        f"{len(jobs)} new listing{'s' if len(jobs) != 1 else ''}"
    )

    def _send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"TailorMyCv Alerts <{settings.smtp_user}>"
        msg["To"] = user_email
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.smtp_host, int(settings.smtp_port)) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, [user_email], msg.as_string())

    try:
        await asyncio.to_thread(_send)
        logger.info("[job-alert] Sent alert email to %s", user_email)
        return True
    except Exception as exc:
        logger.error("[job-alert] SMTP error sending to %s: %s", user_email, exc)
        return False


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

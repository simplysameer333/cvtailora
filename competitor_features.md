# Competitor Feature Analysis — tailormycv.app
*Researched: 2026-06-01 · JobBuddy analysis added 2026-07-05*

---

## Their Full Feature Set

### Core Products
| Feature | Details |
|---------|---------|
| **CV Builder** | Build from scratch or upload + edit existing; 5-min avg build time |
| **Resume Checker** | ATS compatibility, keyword analysis, content quality, section completeness |
| **Cover Letter Generator** | Personalized 3–4 paragraph letters; checkbox in tailoring flow |
| **Job Tracker** | Track applications (status, company, dates) |

### AI Capabilities
| Feature | Details |
|---------|---------|
| **CV Tailoring** | Powered by GPT-4o; reorders achievements, mirrors job language, adjusts summary |
| **Fit Score** | 0–100% match displayed to user; below 30% warns of poor alignment |
| **Gap Analysis** | Shows missing keywords, responsibilities, tools, certifications job requires but CV lacks |
| **ATS Score** | Readability / Format / Keywords % shown after generation |
| **Grammar & spelling check** | Real-time during editing |
| **Action verb suggestions** | Content suggestions with quantifiable achievements |
| **No hallucination guarantee** | AI only works with user's actual experience |

### Templates & Design
| Feature | Details |
|---------|---------|
| **9 templates** | Classic Professional, ATS Boxed, Modern Minimal, Minimalist Modern, Creative Portfolio, Executive Dark, Two-Column Balanced, Photo Sidebar, Header Banner |
| **8 colour schemes per template** | ~72 visual combinations |
| **WYSIWYG live editor** | Edit inline with live PDF preview |
| **Country-specific formats** | USA, UK, Canada, UAE, Saudi Arabia, Algeria, Morocco, Qatar, China |

### Export & Sharing
| Feature | Details |
|---------|---------|
| **PDF export** | ATS-clean, no watermarks |
| **Public CV sharing** | Secure shareable link (view-only); revocable anytime |
| **History tab** | All previous tailored versions saved per job |

### Multi-language
- English, French, Spanish, German, Arabic (RTL)
- Cover letters generated in user's language

### Technical
| Feature | Details |
|---------|---------|
| **OCR** | Handles image-based / scanned PDFs from design tools |
| **File formats** | PDF, DOCX, TXT up to 10MB |
| **Processing speed** | Analysis: 5–10s; Generation: 15–30s |
| **Encryption** | AES-256 at rest and in transit; GDPR compliant |

### Pricing Model
| Plan | Price | Analyses |
|------|-------|----------|
| Free | $0 | 2/month (resets) |
| Premium | $9.99/mo | 20/month |
| Unlimited | $19.99/mo | Unlimited |
| Starter pack | $1 one-time | 3 (never expire) |
| Standard pack | $4.99 one-time | 5 (never expire) |
| Pro pack | $7.99 one-time | 10 (never expire) |

*One-time packages always used before subscription quota. 7-day money-back on subscriptions.*

---

## Gap Analysis — What We're Missing

### High Priority (high user value, feasible)

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 1 | **Cover Letter Generator** | Medium | Add step or standalone page; reuse AI pipeline; job JD already available in builder |
| 2 | **ATS / Fit Score shown to user** | Low | We already compute `min_score` internally — just expose it with labels instead of hiding |
| 3 | **Gap Analysis** | Medium | Compare job skills vs CV skills; we already extract both — show diff to user |
| 4 | **More templates + colour variants** | Medium | Currently limited templates; add colour scheme picker per template |
| 5 | **One-time credit packs** | Low | Alternative to subscription — "buy 5 tailors for $4.99"; good for casual users |

### Medium Priority

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 6 | **WYSIWYG live editor** | High | We have inline editing but not a true live-preview editor; large UX investment |
| 7 | **Public CV sharing** | Low | Generate a read-only shareable link per session/download |
| 8 | **Job Tracker** | Medium | Track saved jobs with application status (Applied, Interview, Offer, Rejected) |
| 9 | **Resume Checker (standalone)** | Medium | Upload any CV → ATS score, keyword report, section completeness without a job JD |
| 10 | **Country-specific formats** | Medium | Region-aware template defaults (photo field for UAE/EU, no photo for US/UK) |

### Lower Priority / Future

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 11 | **Multi-language output** | High | Tailored CV + cover letter in French, Spanish, German, Arabic |
| 12 | **OCR for scanned PDFs** | Low | Add Tesseract/pytesseract fallback in resume_parser.py when pdfplumber returns empty text |
| 13 | **Student / enterprise pricing** | Low | Discount tier; B2B for career coaches / universities |
| 14 | **Action verb suggestions in editor** | Medium | Real-time writing assistance during preview editing |

---

## What We Do Better

| Our Advantage | Details |
|---------------|---------|
| **Multi-model quality loop** | 3 AI evaluators (Anthropic + OpenAI + Google) in parallel — they use GPT-4o only |
| **Job search built-in** | JSearch integration (Indeed/LinkedIn/Glassdoor) — they have no job search |
| **Job Alerts** | Daily email digests for saved searches — they have nothing similar |
| **Section regeneration** | Regenerate individual sections (Pro) — no equivalent on their side |
| **Locked Facts** | Protect specific content from AI edits — unique feature |
| **Dynamic tier config** | Admin can tune limits/features without redeploy |
| **Resume Library** | Save and reuse multiple resumes |
| **One-click Tailor from Jobs** | Find job → tailor resume in one flow |

---

## JobBuddy Analysis (2026-07-05)

Source: "AI Job Application Agent" demo video + 6 UI screenshots. Features only —
implementation would be entirely ours.

### Features they have that we lack

| # | Feature | What it is | Fit / Effort |
|---|---------|-----------|--------------|
| J1 | **Profile completeness %** | Ring gauge + checklist (Basic Info, Summary, Skills, Experience, Education, Resume) + "Improve Profile" CTA | High fit, low effort — we store all the data; pure UI + a scoring rule |
| J2 | **Structured tabbed profile** | Personal / Summary / Skills / Experience / Education / Projects / Certifications tabs, editable, auto-populated from resume parse | High fit, medium — our profile is a flat form; builder extractor already produces this data |
| J3 | **Job match %** | Every job card shows "99% Match — Excellent match" vs profile | High fit, medium — JSearch results + profile skills; needs a match scorer |
| J4 | **Application status tracker** | Total / In Progress / Needs Action / Submitted stat cards + per-application timeline (Queued → Detecting fields → Submitted) | Medium — pairs with deferred "Jobs Applied tracking" |
| J5 | **Auto-apply AI agent** | Agent detects form fields on job site, fills from profile, submits in background; "Apply manually / Apply automatically" choice modal | Big build — already in deferred backlog as autonomous job-application agent |
| J6 | **Missing-field detection + AI autofill** | Application needs data profile lacks → gap form with AI-suggested answers | Part of J5 |
| J7 | **Daily quota widget** | "Daily applies 4/5 used today" progress bar always visible in sidebar | Low effort — tier quotas exist, just not surfaced |
| J8 | **Recent activity feed** | Sidebar panel of latest actions | Low |
| J9 | **Job source toggles** | Greenhouse / Lever / Workable / Wellfound on-off chips above results | Low — cosmetic filter on our search |

### Shipped from this list (2026-07-05/06 session)
- **J1 + J2** — profile completeness ring/checklist + tabbed structured profile (backend scorer + tests).
- **J7** — Daily AI budget quota widget in the new sidebar shell.
- **J5 (UI groundwork)** — "How would you like to apply?" modal with Manual + "AI Agent (Coming soon)" options; agent itself still deferred.
- **J8 (partial)** — Analytics page with an automated-activity feed (alert emails, tailoring runs, exports, scores).
- Also: shared ResumeLibrary component, resume preview modal, per-user alert-email audit trail.

### What we already do better
Multi-model quality loop, CV Score (54 checks), job alerts, resume library,
templates-as-data, section regeneration — unchanged from the June analysis.

---

## Recommended Build Order

1. **Expose Fit Score** — almost zero effort, immediate UX win
2. **Gap Analysis** — high-value, data already available
3. **Cover Letter Generator** — most-searched feature in the resume tool category
4. **One-time credit packs** — unblocks users who don't want a subscription
5. **Public CV sharing** — simple to build, good for virality
6. **Job Tracker** — ties into existing saved jobs feature
7. **Resume Checker (standalone)** — new acquisition funnel (no login needed)
8. **More templates + colour schemes** — polish and differentiation
9. **Job match %** (J3) — match scorer on job cards; data already available
10. **Application status tracker** (J4) — extends saved jobs into a pipeline view
11. **Auto-apply AI agent** (J5+J6) — flagship differentiator, largest build

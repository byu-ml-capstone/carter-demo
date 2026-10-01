"""AI sprint-report draft.

`draft_report` builds one draft from one closed-sprint snapshot. Saving,
regeneration, and HTTP live outside this package.
"""

from sprint_report.draft import SprintReportError, build_model_payload, draft_report

__all__ = ["SprintReportError", "build_model_payload", "draft_report"]

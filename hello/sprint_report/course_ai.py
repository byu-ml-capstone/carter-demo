"""Course-platform AI call used by the sprint-report draft.

The live client runs only when a course API key is configured. Importing
this module does not open a connection. Tests pass a fake model into
`draft_report` and do not call `complete_report`.
"""

from __future__ import annotations

import json
import os


class CourseAINotConfigured(RuntimeError):
    """No course AI credentials are set, so no model call is attempted."""


def course_ai_configured() -> bool:
    return bool(os.environ.get("LITELLM_API_KEY") or os.environ.get("OPENAI_API_KEY"))


def complete_report(system_prompt: str, payload: dict) -> dict:
    """Call the course AI abstraction. Raises if it is not configured."""
    if not course_ai_configured():
        raise CourseAINotConfigured("Course AI client is not configured")

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise CourseAINotConfigured("Course AI client is not configured") from exc

    if os.environ.get("OPENAI_API_KEY") and not os.environ.get("LITELLM_API_KEY"):
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        model = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna")
    else:
        client = OpenAI(
            base_url=os.environ.get(
                "LITELLM_URL",
                os.environ.get(
                    "LITELLM_BASE_URL", "http://ml-capstone.cs.byu.edu:4000/v1"
                ),
            ),
            api_key=os.environ["LITELLM_API_KEY"],
        )
        model = os.environ.get(
            "LITELLM_MODEL", os.environ.get("MODEL", "classroom-chat")
        )

    user_message = json.dumps(payload, indent=2)
    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    return {"text": getattr(response, "output_text", "")}

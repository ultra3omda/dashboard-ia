"""Email sending via Resend, with a graceful fallback to logging when no key is configured."""
from __future__ import annotations
import logging
from typing import Any
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailResult:
    """Lightweight result object returned by send_email.

    `success` — True if accepted by the provider (or logged in dev mode).
    `provider_ids` — list of message IDs returned by the provider.
    `error` — human-readable error message on failure.
    """

    def __init__(
        self,
        success: bool,
        provider_ids: list[str] | None = None,
        error: str | None = None,
    ):
        self.success = success
        self.provider_ids = provider_ids or []
        self.error = error


async def send_email(
    recipients: list[str],
    subject: str,
    html_body: str,
) -> EmailResult:
    """Send one email to a list of recipients. Returns a single EmailResult.

    Behaviour:
    - If RESEND_API_KEY is set: calls the Resend API.
    - Otherwise: logs the subject+first-recipient and returns success=True
      (dev mode — lets you test workflow without an API key).
    """
    settings = get_settings()

    if not recipients:
        return EmailResult(success=False, error="No recipients")

    if not settings.email_enabled:
        logger.info(
            "[Email stub] Would send to %d recipient(s): %s — subject: %s",
            len(recipients), recipients[0] if recipients else "?", subject[:80],
        )
        return EmailResult(success=True, provider_ids=["stub"])

    try:
        import resend  # type: ignore
    except ImportError:
        logger.error("resend package not installed — running in stub mode")
        return EmailResult(
            success=True,
            provider_ids=["stub-no-lib"],
            error="resend library missing",
        )

    try:
        resend.api_key = settings.resend_api_key
        from_name = settings.resend_from_name
        from_email = settings.resend_from_email
        params: dict[str, Any] = {
            "from": f"{from_name} <{from_email}>",
            "to": recipients,
            "subject": subject,
            "html": html_body,
        }
        # The resend library exposes sync Emails.send; running in thread to not block the loop
        import asyncio
        email = await asyncio.to_thread(resend.Emails.send, params)
        message_id = ""
        if isinstance(email, dict):
            message_id = email.get("id", "") or ""
        elif hasattr(email, "id"):
            message_id = getattr(email, "id", "") or ""
        return EmailResult(success=True, provider_ids=[message_id] if message_id else [])
    except Exception as e:
        logger.exception("Resend send failed")
        return EmailResult(success=False, error=str(e))

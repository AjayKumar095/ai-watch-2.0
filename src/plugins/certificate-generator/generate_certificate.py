#!/usr/bin/env python3
"""
Certificate generator plugin — standalone version of the original Django
genCertificate.py, adapted to run as a plain CLI subprocess (no Django app
context required) so it can be invoked from Node via child_process.

Contract with the caller (see ../../src/utils/certificateGenerator.js):
  - All PDF bytes go to stdout, and ONLY PDF bytes go to stdout. Anything
    diagnostic (path checks, errors) goes to stderr instead — mixing the two
    on stdout would silently corrupt the binary PDF stream the Node side is
    trying to read as a single Buffer.
  - Exit code 0 = success, PDF bytes are on stdout.
  - Exit code 1 = failure, human-readable reason is on stderr.
  - The verification code shown on the certificate is passed IN via
    --cert-code, not generated here — the calling application already
    creates and persists the SemesterCertificate row (with its own
    verification code) before rendering the PDF, and the PDF must display
    that same code, not a second independently-generated one. --cert-code
    is optional only so this script can still be run standalone for testing.

Usage:
  python3 generate_certificate.py \
    --name "Riya Kapoor" \
    --ai-level "Proficient" \
    --description "has successfully completed the AI for All program." \
    --cert-code "GU1a2b3c4d5e6f7g8h9i" \
    > output.pdf
"""

import argparse
import os
import sys
import uuid
from datetime import datetime
from io import BytesIO

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.colors import Color

# Resolve the template image relative to THIS file, not to Django's
# settings.BASE_DIR — this is what makes the plugin portable/plug-and-play
# regardless of which project or working directory it's invoked from.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGE_PATH = os.path.join(SCRIPT_DIR, "templates", "base_certificate_AI.png")


def generate_code():
    return "GU" + uuid.uuid4().hex[:18]


def generate_certificate(name, ai_level, description, cert_code=None):
    if not os.path.exists(IMAGE_PATH):
        raise FileNotFoundError(f"Certificate template not found at: {IMAGE_PATH}")

    buffer = BytesIO()

    width, height = landscape(A4)
    c = canvas.Canvas(buffer, pagesize=(width, height))

    # Background
    c.drawImage(IMAGE_PATH, 0, 0, width=width, height=height)

    # Code
    cert_code = cert_code or generate_code()
    c.setFont("Times-Italic", 11)
    c.drawCentredString(width - 140, height - 60, cert_code)

    # AI Level
    if ai_level:
        c.setFont("Times-Bold", 18)
        c.setFillColor(Color(239 / 255, 134 / 255, 42 / 255))
        c.drawCentredString(width / 2, height - 230, ai_level)

    c.setFillColor(Color(0, 0, 0))

    # Name
    c.setFont("Times-Italic", 24)
    c.drawCentredString(width / 2, height - 310, name)

    # Description
    styles = getSampleStyleSheet()
    desc_style = ParagraphStyle(
        "desc",
        parent=styles["Normal"],
        alignment=1,
        fontName="Times-Roman",
        fontSize=16,
        leading=30,
    )
    paragraph = Paragraph(description, desc_style)
    paragraph.wrap(400, 100)
    paragraph.drawOn(c, (width - 400) / 2, height - 420)

    # Date
    today = datetime.now().strftime("%d %B %Y")
    c.setFont("Times-Italic", 16)
    c.drawCentredString(width / 2, height - 450, f"Date: {today}")

    c.save()
    buffer.seek(0)

    return buffer, cert_code


def main():
    parser = argparse.ArgumentParser(description="Generate an AI-Watch completion certificate PDF.")
    parser.add_argument("--name", required=True, help="Student's full name")
    parser.add_argument("--ai-level", default="", help="AI proficiency level (optional)")
    parser.add_argument("--description", required=True, help="Certificate body text")
    parser.add_argument("--cert-code", default=None, help="Verification code to print (generated if omitted)")
    args = parser.parse_args()

    try:
        buffer, cert_code = generate_certificate(
            name=args.name,
            ai_level=args.ai_level,
            description=args.description,
            cert_code=args.cert_code,
        )
    except Exception as e:
        print(f"Certificate generation failed: {e}", file=sys.stderr)
        sys.exit(1)

    # Log the resolved cert code to stderr for debugging visibility —
    # stdout is reserved exclusively for the raw PDF bytes below.
    print(f"Generated certificate, code={cert_code}", file=sys.stderr)

    sys.stdout.buffer.write(buffer.read())
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()

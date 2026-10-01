FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy every top-level Python module. main.py imports auth, dao, db, and domain.
COPY *.py ./

# Schema migration SQL files. Applied on startup from backend/migrations.
COPY migrations/ ./migrations/

# Sprint-report package owned by the data scientist. The draft route imports
# sprint_report.draft_report and does not modify this package.
COPY sprint_report ./sprint_report

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health').read()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

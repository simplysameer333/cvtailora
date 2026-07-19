FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libreoffice \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Headless Chromium for template-faithful PDF export (services/pdf_renderer.py).
# --with-deps pulls the shared libraries Chromium needs on debian-slim.
RUN python -m playwright install --with-deps chromium

COPY . .

RUN mkdir -p templates/prebuilt templates/uploads

EXPOSE 9000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-9000}

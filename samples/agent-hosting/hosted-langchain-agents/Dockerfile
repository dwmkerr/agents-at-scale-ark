FROM python:3.14.0-slim

WORKDIR /app

RUN apt-get update \
 && apt-get upgrade -y libgnutls30 \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

RUN addgroup --system agent \
 && adduser --system --uid 1001 --home /home/agent --ingroup agent agent

COPY pyproject.toml uv.lock README.md ./

RUN uv sync --frozen

COPY src/ ./src/

ENV HOME=/home/agent
ENV XDG_CACHE_HOME=/home/agent/.cache
RUN mkdir -p /home/agent/.cache/uv \
 && chown -R agent:agent /home/agent /app

USER agent

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uv", "run", "python", "-m", "hosted_langchain_agents", "--host", "0.0.0.0", "--port", "8000"]

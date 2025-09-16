FROM python:3.11-slim

WORKDIR /app

# Install uv for fast Python package management
RUN pip install uv

# Copy project files
COPY pyproject.toml ./
COPY uv.lock* ./

# Install dependencies
RUN uv sync --frozen

# Copy source code
COPY . .

# Run the MCP server
CMD ["uv", "run", "python", "-m", "reverse_tool"]

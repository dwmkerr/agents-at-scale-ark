# ARK CLI

Interactive terminal interface for ARK agents.

## Prerequisites

1. **Kubernetes cluster** - You need access to a Kubernetes cluster. For local development, you can use:
   - [Minikube](https://minikube.sigs.k8s.io/docs/start) - Recommended for local development
   - [Docker Desktop](https://docs.docker.com/desktop/kubernetes/) - Built-in Kubernetes support
   - [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/) - Kubernetes in Docker

2. **ARK system deployed** in your Kubernetes cluster
3. **Gateway setup** for service discovery:
   ```bash
   # From agents-at-scale project root
   make localhost-gateway-install
   ```

## Installation

```bash
cd tools/ark-cli
npm run build
npm install -g .
```

## Usage

```bash
# Interactive mode (no arguments)
ark

# Show help
ark --help
ark cluster --help

# Check system status
ark check status

# Generate (project, agent, team, etc)
ark generate

# Cluster operations
ark cluster get-type
ark cluster get-ip
ark cluster get-ip --verbose
ark cluster get-ip --context minikube

# Show shell autocomplete options.
ark autocomplete
```

## Configuration

ARK CLI automatically detects services via:

1. **localhost-gateway** (when running) - `*.127.0.0.1.nip.io:8080`
2. **Kubernetes service discovery** - for internal services
3. **Default localhost URLs** - fallback

Settings stored in `~/.config/ark-cli/config.json`

## Development

**Note:** All make commands must be run from the repository root directory.

```bash
# From repository root
make ark-cli-install         # Build and install globally
make ark-cli-build           # Build only
make clean                   # Clean build artifacts and stamp files
make ark-cli-uninstall       # Remove global installation

# From tools/ark-cli directory
npm run lint         # Run linting and formatting
npm run lint:check   # Check linting without fixing
```

## Troubleshooting

Enable debug logging to see detailed configuration discovery and service resolution:

```bash
# Debug configuration discovery and service resolution
DEBUG=ark:config ark check status

# Debug all ARK CLI components
DEBUG=ark:* ark check status

# Keep debug enabled for multiple commands
export DEBUG=ark:config
ark check status
ark dashboard
```

**Common debug scenarios:**

- **Wrong URL detected**: See which discovery method is being used
- **Service timeouts**: Check localhost-gateway and kubernetes connectivity
- **Config issues**: Trace fallback logic through multiple discovery methods

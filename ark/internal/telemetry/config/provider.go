/* Copyright 2025. McKinsey & Company */

package config

import (
	"context"
	"os"
	"strings"

	otelapi "go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"mckinsey.com/ark/internal/telemetry"
	"mckinsey.com/ark/internal/telemetry/noop"
	otelimpl "mckinsey.com/ark/internal/telemetry/otel"
)

var log = logf.Log.WithName("telemetry.config")

// Provider manages telemetry lifecycle and provides tracers/recorders.
type Provider struct {
	tracer        telemetry.Tracer
	queryRecorder telemetry.QueryRecorder
	agentRecorder telemetry.AgentRecorder
	modelRecorder telemetry.ModelRecorder
	toolRecorder  telemetry.ToolRecorder
	teamRecorder  telemetry.TeamRecorder
	shutdown      func() error
}

// NewProvider creates a telemetry provider based on configuration.
// If OTEL endpoint is not configured, returns a no-op provider.
func NewProvider() *Provider {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		log.Info("OTEL_EXPORTER_OTLP_ENDPOINT not set, using no-op telemetry")
		return newNoopProvider()
	}

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "ark-controller"
	}

	headers := os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")

	protocol := os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL")
	if protocol == "" {
		protocol = "grpc"
	}

	log.Info("initializing OTEL telemetry", "endpoint", endpoint, "service", serviceName, "protocol", protocol, "headers", headers)

	var primaryExporter trace.SpanExporter
	var err error

	if strings.EqualFold(protocol, "grpc") {
		primaryExporter, err = otlptracegrpc.New(
			context.Background(),
			otlptracegrpc.WithEndpoint(endpoint),
			otlptracegrpc.WithInsecure(),
		)
	} else {
		primaryExporter, err = otlptracehttp.New(context.Background())
	}
	if err != nil {
		log.Error(err, "failed to create OTLP exporter, falling back to no-op telemetry")
		return newNoopProvider()
	}

	var exporter trace.SpanExporter = primaryExporter

	brokerEndpoint := os.Getenv("ARK_BROKER_OTLP_ENDPOINT")
	if brokerEndpoint != "" {
		log.Info("ARK_BROKER_OTLP_ENDPOINT set, forking spans to broker", "brokerEndpoint", brokerEndpoint)
		brokerExporter, err := otlptracehttp.New(
			context.Background(),
			otlptracehttp.WithEndpoint(brokerEndpoint),
			otlptracehttp.WithInsecure(),
		)
		if err != nil {
			log.Error(err, "failed to create broker OTLP exporter, continuing without broker")
		} else {
			exporter = newForkingExporter(primaryExporter, brokerExporter)
		}
	}

	tp := trace.NewTracerProvider(
		trace.WithBatcher(exporter),
		trace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
		)),
	)

	otelapi.SetTracerProvider(tp)

	// Send startup event
	sendStartupEvent(serviceName)

	// Create OTEL-backed implementations
	tracer := otelimpl.NewTracer("ark/controller")
	queryRecorder := otelimpl.NewQueryRecorder(tracer)
	agentRecorder := otelimpl.NewAgentRecorder(tracer)
	modelRecorder := otelimpl.NewModelRecorder(tracer)
	toolRecorder := otelimpl.NewToolRecorder(tracer)
	teamRecorder := otelimpl.NewTeamRecorder(tracer)

	log.Info("OTEL telemetry initialized successfully")

	return &Provider{
		tracer:        tracer,
		queryRecorder: queryRecorder,
		agentRecorder: agentRecorder,
		modelRecorder: modelRecorder,
		toolRecorder:  toolRecorder,
		teamRecorder:  teamRecorder,
		shutdown: func() error {
			log.Info("shutting down telemetry")
			return tp.Shutdown(context.Background())
		},
	}
}

// newNoopProvider creates a no-op telemetry provider.
func newNoopProvider() *Provider {
	tracer := noop.NewTracer()
	queryRecorder := noop.NewQueryRecorder()
	agentRecorder := noop.NewAgentRecorder()
	modelRecorder := noop.NewModelRecorder()
	toolRecorder := noop.NewToolRecorder()
	teamRecorder := noop.NewTeamRecorder()

	return &Provider{
		tracer:        tracer,
		queryRecorder: queryRecorder,
		agentRecorder: agentRecorder,
		modelRecorder: modelRecorder,
		toolRecorder:  toolRecorder,
		teamRecorder:  teamRecorder,
		shutdown:      func() error { return nil },
	}
}

// Tracer returns the tracer instance.
func (p *Provider) Tracer() telemetry.Tracer {
	return p.tracer
}

// QueryRecorder returns the query recorder instance.
func (p *Provider) QueryRecorder() telemetry.QueryRecorder {
	return p.queryRecorder
}

// AgentRecorder returns the agent recorder instance.
func (p *Provider) AgentRecorder() telemetry.AgentRecorder {
	return p.agentRecorder
}

// ModelRecorder returns the model recorder instance.
func (p *Provider) ModelRecorder() telemetry.ModelRecorder {
	return p.modelRecorder
}

// ToolRecorder returns the tool recorder instance.
func (p *Provider) ToolRecorder() telemetry.ToolRecorder {
	return p.toolRecorder
}

// TeamRecorder returns the team recorder instance.
func (p *Provider) TeamRecorder() telemetry.TeamRecorder {
	return p.teamRecorder
}

// Shutdown gracefully shuts down the telemetry provider.
// Should be called during application shutdown.
func (p *Provider) Shutdown() error {
	return p.shutdown()
}

// sendStartupEvent sends a basic startup event to validate telemetry.
func sendStartupEvent(serviceName string) {
	tracer := otelapi.Tracer("ark/controller-startup")
	_, span := tracer.Start(context.Background(), "controller.startup")
	defer span.End()

	version := os.Getenv("VERSION")
	if version == "" {
		version = "dev"
	}

	span.SetAttributes(
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(version),
	)

	log.Info("sent controller startup telemetry event")
}

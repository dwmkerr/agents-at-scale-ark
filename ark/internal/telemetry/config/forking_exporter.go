/* Copyright 2025. McKinsey & Company */

package config

import (
	"context"

	"go.opentelemetry.io/otel/sdk/trace"
)

type forkingExporter struct {
	exporters []trace.SpanExporter
}

func newForkingExporter(exporters ...trace.SpanExporter) *forkingExporter {
	return &forkingExporter{exporters: exporters}
}

func (f *forkingExporter) ExportSpans(ctx context.Context, spans []trace.ReadOnlySpan) error {
	var lastErr error
	for _, exp := range f.exporters {
		if err := exp.ExportSpans(ctx, spans); err != nil {
			log.Error(err, "failed to export spans to destination")
			lastErr = err
		}
	}
	return lastErr
}

func (f *forkingExporter) Shutdown(ctx context.Context) error {
	var lastErr error
	for _, exp := range f.exporters {
		if err := exp.Shutdown(ctx); err != nil {
			lastErr = err
		}
	}
	return lastErr
}

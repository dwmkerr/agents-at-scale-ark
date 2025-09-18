/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/genai"
)

type ModelReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	resolver *common.ValueSourceResolver
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch

func (r *ModelReconciler) getResolver() *common.ValueSourceResolver {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolver(r.Client)
	}
	return r.resolver
}

func (r *ModelReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	var obj arkv1alpha1.Model
	if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
		if client.IgnoreNotFound(err) != nil {
			log.Error(err, "unable to fetch model", "model", req.NamespacedName)
		}
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	switch obj.Status.Phase {
	case statusReady, statusError:
		return ctrl.Result{}, nil
	case statusRunning:
		recorder := genai.NewModelRecorder(&obj, r.Recorder)

		// Create operation tracker for model resolution
		modelTracker := genai.NewOperationTracker(recorder, ctx, "ModelResolve", obj.Name, map[string]string{
			"namespace": obj.Namespace,
			"modelName": obj.Spec.Model.Value,
		})

		if err := r.reconcileModel(ctx, obj); err != nil {
			log.Info("model error", "error", err.Error())
			modelTracker.Fail(err)
			if err := r.updateStatus(ctx, obj, statusError); err != nil {
				return ctrl.Result{}, err
			}
		} else {
			modelTracker.Complete("resolved")
			if err := r.updateStatus(ctx, obj, statusReady); err != nil {
				return ctrl.Result{}, err
			}

		}
	default:
		if err := r.updateStatus(ctx, obj, statusRunning); err != nil {
			return ctrl.Result{}, err
		}
	}
	return ctrl.Result{}, nil
}

func (r *ModelReconciler) reconcileModel(ctx context.Context, obj arkv1alpha1.Model) error {
	resolvedModel, err := r.resolveModel(ctx, &obj)
	if err != nil {
		return err
	}

	validationCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	testMessages := []genai.Message{genai.NewUserMessage("Hello")}
	_, err = resolvedModel.ChatCompletion(validationCtx, testMessages, nil)
	return err
}

func (r *ModelReconciler) resolveModel(ctx context.Context, model *arkv1alpha1.Model) (*genai.Model, error) {
	resolver := r.getResolver()

	modelName, err := resolver.ResolveValueSource(ctx, model.Spec.Model, model.Namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve model: %w", err)
	}

	resolvedModel := &genai.Model{
		Model: modelName,
		Type:  model.Spec.Type,
	}

	// Handle provider-specific configuration
	switch model.Spec.Type {
	case "azure":
		if model.Spec.Config.Azure == nil {
			return nil, fmt.Errorf("azure configuration is required for azure model type")
		}
		baseURL, err := resolver.ResolveValueSource(ctx, model.Spec.Config.Azure.BaseURL, model.Namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Azure baseURL: %w", err)
		}
		apiKey, err := resolver.ResolveValueSource(ctx, model.Spec.Config.Azure.APIKey, model.Namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Azure apiKey: %w", err)
		}
		var apiVersion string
		if model.Spec.Config.Azure.APIVersion != nil {
			apiVersion, err = resolver.ResolveValueSource(ctx, *model.Spec.Config.Azure.APIVersion, model.Namespace)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve Azure apiVersion: %w", err)
			}
		}

		resolvedModel.Provider = &genai.AzureProvider{
			Model:      modelName,
			BaseURL:    baseURL,
			APIKey:     apiKey,
			APIVersion: apiVersion,
		}
		model.Status.ResolvedAddress = baseURL

	case "openai":
		if model.Spec.Config.OpenAI == nil {
			return nil, fmt.Errorf("openai configuration is required for openai model type")
		}
		baseURL, err := resolver.ResolveValueSource(ctx, model.Spec.Config.OpenAI.BaseURL, model.Namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve OpenAI baseURL: %w", err)
		}
		apiKey, err := resolver.ResolveValueSource(ctx, model.Spec.Config.OpenAI.APIKey, model.Namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve OpenAI apiKey: %w", err)
		}

		resolvedModel.Provider = &genai.OpenAIProvider{
			Model:   modelName,
			BaseURL: baseURL,
			APIKey:  apiKey,
		}
		model.Status.ResolvedAddress = baseURL

	case "bedrock":
		// Bedrock doesn't use baseURL or apiKey - handled by LoadModel function
		// Just use LoadModel directly for Bedrock
		return genai.LoadModel(ctx, r.Client, model.Name, model.Namespace)
	default:
		return nil, fmt.Errorf("unsupported model type: %s", model.Spec.Type)
	}

	return resolvedModel, nil
}

func (r *ModelReconciler) updateStatus(ctx context.Context, obj arkv1alpha1.Model, status string) error {
	if ctx.Err() != nil {
		return nil
	}
	obj.Status.Phase = status
	err := r.Status().Update(ctx, &obj)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update model status", "status", status)
	}
	return err
}

func (r *ModelReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Model{}).
		Named("model").
		Complete(r)
}

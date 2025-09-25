.DEFAULT_GOAL := help

# Configuration
RELEASE_NAME := {{ .Values.project.name }}
IMAGE_NAME := {{ .Values.devspace.image.repository }}
CHART_PATH := ./chart
NAMESPACE ?= default

.PHONY: help
help: # show help for each recipe
	@grep -E '^[a-zA-Z0-9 -]+:.*#' Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

.PHONY: build
build: # build the container image
	docker build -t $(IMAGE_NAME) .

.PHONY: dev
dev: # run in development mode with DevSpace
	devspace dev

.PHONY: install
install: # install the tool to the cluster using DevSpace
	devspace deploy

.PHONY: uninstall
uninstall: # uninstall the tool from the cluster
	devspace purge
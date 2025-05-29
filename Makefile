# Makefile for Docker multi-platform build & version management

IMAGE_NAME=anshuljkt1/dd-bot-advanced
PROGRAM_FILE=src/DD_Bot.Bot/Program.cs

# VERSION can be passed or extracted from Program.cs
VERSION ?= $(shell grep 'string version' $(PROGRAM_FILE) | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')

TAGS=--tag $(IMAGE_NAME):latest --tag $(IMAGE_NAME):$(VERSION)
# --tag $(IMAGE_NAME):stable
PLATFORMS=linux/amd64,linux/arm64

.PHONY: build set-version release

## Build and push Docker image
build:
	docker buildx build \
		--push \
		--platform $(PLATFORMS) \
		$(TAGS) \
		.

## Set the version in Program.cs
set-version:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION not specified"; exit 1; \
	fi
	sed -E -i '' 's/(string version = ")[^"]+(")/\1$(VERSION)\2/' $(PROGRAM_FILE)
	@echo "✅ Updated version to $(VERSION) in $(PROGRAM_FILE)"

## Set version and build/push image
release: set-version build
	@echo "🚀 Release complete for version $(VERSION)"

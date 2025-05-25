# Makefile for Docker multi-platform build
IMAGE_NAME=anshuljkt1/dd-bot-advanced

# Extract version from Program.cs using grep + sed
VERSION := $(shell grep 'string version' src/DD_Bot.Bot/Program.cs | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')

TAGS=--tag $(IMAGE_NAME):latest --tag $(IMAGE_NAME):$(VERSION)
PLATFORMS=linux/amd64,linux/arm64

.PHONY: build

build:
	docker buildx build \
		--push \
		--platform $(PLATFORMS) \
		$(TAGS) \
		.

.PHONY: build run test clean

build:
	docker build -t ark-broker:latest .

run:
	go run *.go

test:
	go test ./...

clean:
	rm -rf data/

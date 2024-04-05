#!/bin/bash

set -e

export RUST_LOG=OFF

echo "Building"
anchor build

echo "Unit tests"
cargo test -- --nocapture

echo "Integration tests (Rust)"
cargo test-bpf -- --nocapture

echo "Integration tests (Typescript)"
# npm install
anchor test -- --features test

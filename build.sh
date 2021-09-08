#!/bin/bash
TARGET="${CARGO_TARGET_DIR:-target}"
set -e

RUSTFLAGS='-C link-arg=-s' cargo build --target wasm32-unknown-unknown --release

mkdir -p ./res
cp $TARGET/wasm32-unknown-unknown/release/tenk.wasm ./res/

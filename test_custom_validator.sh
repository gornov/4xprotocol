#!/bin/bash

set -e

pushd ~/solana

cargo b

popd

source ./init.sh

#!/bin/bash

set -e

source ./dump_clones.sh

trap 'kill $BGPID; echo " Stopping solana-test-validator"; exit' SIGINT SIGTERM ERR

echo "[Build]"
anchor build

# shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL
# https://github.com/solana-labs/solana-program-library/blob/master/shared-memory/program/program-id.md

custom_validator='solana-test-validator'
# custom_validator='~/solana/target/debug/solana-test-validator'

RUST_LOG=WARN $custom_validator --log -r \
    --account J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix ./1.json \
    --account 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX ./2.json \
    --account BLArYBCUYhdWiY8PCUTpvFE21iaJq85dvxLk9bYMobcU ./3.json \
    --account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr ./4.json \
    --account 5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7 ./5.json \
    --account 57UN21JkJ6QUmPKWNkQB4LviGdK5JyvUMEyWFS1tVSzn ./6.json \
    --bpf-program shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL ./spl_shared_memory.so \
    --url devnet &
    # --bpf-program prog_id.json target/deploy/perpetuals.so &
BGPID=$!

./wait_for_port.sh 8899

echo "[Deploy]"
anchor deploy --provider.cluster localnet \
    --program-name perpetuals \
    --program-keypair prog_id.json
echo "[IDL init]"
anchor idl init --provider.cluster localnet \
    --filepath ./target/idl/perpetuals.json $(solana-keygen pubkey prog_id.json)

pushd app

cli="npx ts-node src/cli.ts --url http://localhost:8899 -k $HOME/.config/solana/id.json"

echo "[CLI Init]"
$cli init --min-signatures 1 $(solana address)

$cli add-pool TestPool2
$cli add-custody TestPool2 So11111111111111111111111111111111111111112 J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix
$cli add-custody TestPool2 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX BLArYBCUYhdWiY8PCUTpvFE21iaJq85dvxLk9bYMobcU
$cli add-custody TestPool2 Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr 5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7 true

popd

echo "[Transfer]"
solana transfer --url localhost HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu 11 --allow-unfunded-recipient &
TRANSFER_PID=$!

echo "[Create account]"
spl-token create-account --url localhost 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX
echo "[Mint]"
spl-token mint --url localhost 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX 100 || echo "Mint failed"

wait $TRANSFER_PID

pushd app

spl-token unwrap 5Y5n5yTiRKiYLQHyfxryKmdwWJyQd9CXgKTnKhNLo55B || echo "Unwrap failed"
spl-token wrap 200

npx ts-node src/cli.ts add-liquidity \
    TestPool2 \
    So11111111111111111111111111111111111111112 \
    --amount 100100100100

# npx ts-node src/cli.ts upgrade-custody TestPool2 So11111111111111111111111111111111111111112
# npx ts-node src/cli.ts upgrade-position TestPool2 So11111111111111111111111111111111111111112 HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu long

# HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu is user address
# TestPool1 is pool name
# So11111111111111111111111111111111111111112 is position token mint
# Position is: long | short

# # Check profit or loss
# npx ts-node src/cli.ts get-pnl \
#     HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu \
#     TestPool1 \
#     So11111111111111111111111111111111111111112 \
#     long

# npx ts-node src/cli.ts get-exit-price-and-fee \
#     HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu \
#     TestPool1 \
#     So11111111111111111111111111111111111111112 \
#     long

# # get actual price from `get-exit-price-and-fee`
# npx ts-node src/cli.ts trigger-position \
#     TestPool1 \
#     So11111111111111111111111111111111111111112 \
#     HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu \
#     long \
#     HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu \
#     -p 183769543

popd

echo "[Started]"
echo "[Waiting for Ctrl-C]"
wait $BGPID

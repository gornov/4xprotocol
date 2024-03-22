#!/bin/bash

set -e

source ./dump_clones.sh

trap 'kill $BGPID; echo " Stopping solana-test-validator"; exit' SIGINT SIGTERM

anchor build

# shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL
# https://github.com/solana-labs/solana-program-library/blob/master/shared-memory/program/program-id.md

solana-test-validator -q -r \
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

anchor deploy --program-name perpetuals --program-keypair prog_id.json
anchor idl init --filepath ./target/idl/perpetuals.json $(solana-keygen pubkey prog_id.json)

cd app

cli="npx ts-node src/cli.ts --url http://localhost:8899 -k /home/zotho/.config/solana/id.json"

$cli init --min-signatures 1 $(solana address)

$cli add-pool TestPool1
$cli add-custody TestPool1 So11111111111111111111111111111111111111112 J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix
$cli add-custody TestPool1 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX BLArYBCUYhdWiY8PCUTpvFE21iaJq85dvxLk9bYMobcU
$cli add-custody TestPool1 Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr 5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7 true

cd -

solana transfer HwtueJY1Brqx52SuEhwnhYs9MXCwTGcvVKjdUvoLEvnu 100 --allow-unfunded-recipient

spl-token create-account 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX
spl-token mint 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX 100

wait $BGPID

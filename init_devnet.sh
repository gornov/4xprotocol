#!/bin/bash

set -e

anchor build
anchor deploy --provider.cluster devnet \
    --program-name perpetuals \
    --program-keypair prog_id.json

anchor idl init --provider.cluster devnet \
    --filepath ./target/idl/perpetuals.json \
    $(solana-keygen pubkey prog_id.json)

pushd app

cli="npx ts-node src/cli.ts --url https://api.devnet.solana.com -k /home/zotho/.config/solana/id.json"

$cli init --min-signatures 1 $(solana address)

$cli add-pool TestPool1
$cli add-custody TestPool1 So11111111111111111111111111111111111111112 J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix
$cli add-custody TestPool1 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX BLArYBCUYhdWiY8PCUTpvFE21iaJq85dvxLk9bYMobcU
$cli add-custody TestPool1 Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr 5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7 true

popd -

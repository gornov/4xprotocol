#!/bin/bash

solana account --url devnet J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix --output-file orig_1.json --output json-compact
solana account --url devnet 6QGdQbaZEgpXqqbGwXJZXwbZ9xJnthfyYNZ92ARzTdAX --output-file orig_2.json --output json-compact
solana account --url devnet BLArYBCUYhdWiY8PCUTpvFE21iaJq85dvxLk9bYMobcU --output-file orig_3.json --output json-compact
solana account --url devnet Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr --output-file orig_4.json --output json-compact
solana account --url devnet 5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7 --output-file orig_5.json --output json-compact
solana account --url devnet 57UN21JkJ6QUmPKWNkQB4LviGdK5JyvUMEyWFS1tVSzn --output-file orig_6.json --output json-compact

echo $(./jq-linux64 -r -c '.account.owner = "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"' orig_1.json) > 1.json
# echo $(./jq-linux64 -r -c '.account.owner = "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"' orig_2.json) > 2.json
echo $(./jq-linux64 -r -c '.account.owner = "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"' orig_3.json) > 3.json
# echo $(./jq-linux64 -r -c '.account.owner = "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"' orig_4.json) > 4.json
echo $(./jq-linux64 -r -c '.account.owner = "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"' orig_5.json) > 5.json
echo $(./jq-linux64 -r -c '.account.owner = "shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"' orig_6.json) > 6.json

cp orig_2.json 2.json
cp orig_4.json 4.json
